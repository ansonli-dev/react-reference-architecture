import { setTimeout as delay } from 'node:timers/promises';
import {
  checkContract,
  fingerprint,
  repository,
  requireThat,
  same,
  targets,
  validateCandidate,
  validateRefs,
} from './contracts.mjs';

const verified = new WeakMap();
const workflows = { develop: 'develop', test: 'test', prod: 'promote-prod' };
// Fixed owner lanes from the VENU-23 offline Workflow preview.
const developSteps = {
  dev_a: ['b_a_4_wait', 'b_a_4_smoke'],
  dev_b: ['b_b_4_wait', 'b_b_4_smoke'],
};

export function githubAttemptPath(payload) {
  checkContract('callback', payload, 'CALLBACK_INVALID');
  return (
    '/repos/' +
    repository +
    '/actions/runs/' +
    payload.run_id +
    '/attempts/' +
    payload.run_attempt
  );
}

function resolveRoute(record, candidate, owners) {
  const env = record.environment;
  let owner;
  let wait;
  let next;
  if (env === 'develop') {
    const item = candidate.items.find(
      (value) => value.issue_id === record.issue_id,
    );
    owner = item?.implementation_owner;
    requireThat(
      owner && owners?.dev_a && owners.dev_b && owners.dev_a !== owners.dev_b,
      'DEVELOP_OWNER_MAPPING_UNVERIFIED',
    );
    const lane = Object.keys(developSteps).find(
      (role) => owners[role] === owner,
    );
    const steps = developSteps[lane];
    requireThat(steps, 'CALLBACK_ISSUE_MISMATCH');
    [wait, next] = steps;
  } else {
    requireThat(
      record.issue_id === candidate.release_issue_id,
      'CALLBACK_ISSUE_MISMATCH',
    );
    wait = env + '_deployment';
    next = env === 'test' ? 'c3' : 'd3';
  }
  requireThat(record.expected_step === wait, 'CALLBACK_WORKFLOW_MISMATCH');
  return {
    registration: {
      issue_id: record.issue_id,
      step: wait,
      round: record.step_round,
      candidate_id: record.candidate_id,
      revision: record.revision,
      ...(owner && { implementation_owner: owner }),
    },
    next_step: record.conclusion === 'success' ? next : 'infra_triage',
  };
}

export function validateCallback(payload, trustedRun, candidate, currentStep) {
  checkContract('callback', payload, 'CALLBACK_INVALID');
  validateCandidate(candidate);
  validateRefs(payload.config_refs);
  const env = payload.environment;
  requireThat(
    payload.workflow_path === '.github/workflows/' + workflows[env] + '.yml' &&
      payload.namespace === targets[env].namespace,
    'CALLBACK_WORKFLOW_MISMATCH',
  );
  requireThat(trustedRun?.status === 'completed', 'RUN_NOT_TERMINAL');
  requireThat(
    trustedRun.authorized_workflow === true &&
      trustedRun.provenance_verified === true &&
      same(trustedRun.record, payload),
    'CALLBACK_SOURCE_MISMATCH',
  );
  requireThat(
    payload.candidate_id === candidate.candidate_id &&
      payload.revision === candidate.revision &&
      payload.source_sha === candidate.source_sha &&
      (payload.test_sha === null || payload.test_sha === candidate.test_sha) &&
      (payload.prod_sha === null ||
        payload.prod_sha === candidate.prod_merge_sha) &&
      (env !== 'prod' || payload.test_sha === candidate.test_sha) &&
      payload.manifest_digest === candidate.manifest_digest &&
      same(payload.config_refs, candidate.config_refs_by_environment[env]),
    'CALLBACK_VERSION_MISMATCH',
  );
  if (env === 'develop') {
    requireThat(
      payload.run_id === candidate.build_run_id &&
        payload.run_attempt === candidate.build_run_attempt,
      'DEVELOP_RUN_MISMATCH',
    );
  }
  if (payload.conclusion === 'success' || payload.deployed_sha !== null) {
    const intended = {
      develop: candidate.source_sha,
      test: payload.test_sha,
      prod: payload.prod_sha,
    }[env];
    requireThat(
      payload.deployed_sha &&
        payload.deployed_sha === intended &&
        trustedRun.deployment_verified === true,
      'DEPLOYMENT_NOT_VERIFIED',
    );
    if (env === 'test') {
      const tested = candidate.test_deployment;
      requireThat(
        tested?.run_id === payload.run_id &&
          tested.run_attempt === payload.run_attempt &&
          tested.evidence_id === payload.evidence_id,
        'TEST_DEPLOYMENT_MISMATCH',
      );
    }
  }

  const route = resolveRoute(payload, candidate, trustedRun.develop_owners);
  if (
    currentStep?.candidate_id === payload.candidate_id &&
    currentStep.revision === payload.revision
  ) {
    requireThat(
      currentStep.issue_id === payload.issue_id,
      'CALLBACK_ISSUE_MISMATCH',
    );
  }
  const observation = {
    record: structuredClone(payload),
    ...route,
    payload_digest: fingerprint(payload),
    event_key: fingerprint([
      payload.repository,
      env,
      payload.run_id,
      payload.run_attempt,
      payload.candidate_id,
      payload.issue_id,
    ]),
    transition_key: fingerprint(route.registration),
  };
  verified.set(observation, structuredClone(observation));
  return observation;
}

export function decideTransition(observation, state) {
  requireThat(
    verified.has(observation) && same(verified.get(observation), observation),
    'UNVERIFIED_OBSERVATION',
  );
  if (state?.conditional_write_verified !== true)
    return { action: 'reject', code: 'RECEIVER_CAPABILITY_UNVERIFIED' };
  const { event_key, payload_digest, transition_key, record } = observation;
  const result = {
    event_key,
    payload_digest,
    transition_key,
    conclusion: record.conclusion,
  };
  const stored = state.events?.[event_key];
  if (stored && stored !== payload_digest)
    return { ...result, action: 'conflict', code: 'PAYLOAD_CONFLICT' };
  if (state.transitions?.[transition_key])
    return { ...result, action: 'record_only', code: 'STEP_ALREADY_APPLIED' };
  if (!state.reg)
    return { ...result, action: 'wait', code: 'CANDIDATE_NOT_REGISTERED' };
  if (
    !same(state.reg, observation.registration) ||
    record.run_id !== state.latest_run_id ||
    record.run_attempt < state.latest_attempt
  )
    return { ...result, action: 'record_only', code: 'STALE_OBSERVATION' };
  if (record.run_attempt !== state.latest_attempt)
    return { ...result, action: 'wait', code: 'ATTEMPT_NOT_REGISTERED' };
  return {
    ...result,
    action: 'transition',
    next_step: observation.next_step,
    expected: state.reg,
    expected_run_id: state.latest_run_id,
    expected_attempt: state.latest_attempt,
  };
}

export async function deliverCallback(observation, transport) {
  requireThat(
    verified.has(observation) && same(verified.get(observation), observation),
    'UNVERIFIED_OBSERVATION',
  );
  if (transport?.capability_verified !== true)
    return {
      outcome: 'blocked',
      attempts: 0,
      code: 'RECEIVER_CAPABILITY_UNVERIFIED',
    };
  const { signal, send, wait = delay } = transport;
  for (let attempts = 1; attempts <= 3; attempts++) {
    if (signal?.aborted)
      return { outcome: 'cancelled', attempts: attempts - 1 };
    let status;
    try {
      // The transport contract must honor the signal. No URL is taken from the payload.
      const timeout = AbortSignal.timeout(3000);
      status = await send(
        structuredClone(observation),
        signal ? AbortSignal.any([signal, timeout]) : timeout,
      );
    } catch {
      status = 503;
    }
    if (signal?.aborted) return { outcome: 'cancelled', attempts };
    if (status >= 200 && status < 300) return { outcome: 'accepted', attempts };
    if (status === 401 || status === 403)
      return { outcome: 'auth_failed', attempts };
    if (status !== 408 && status !== 429 && !(status >= 500 && status <= 599))
      return { outcome: 'rejected', attempts };
    if (attempts < 3) {
      try {
        await wait(250 * 2 ** (attempts - 1), undefined, { signal });
      } catch {
        return {
          outcome: signal?.aborted ? 'cancelled' : 'transport_failed',
          attempts,
        };
      }
    }
  }
  return { outcome: 'retry_exhausted', attempts: 3 };
}
