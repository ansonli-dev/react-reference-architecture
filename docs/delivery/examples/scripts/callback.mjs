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

function registrationFor(record) {
  return {
    issue_id: record.issue_id,
    step: record.expected_step,
    round: record.step_round,
    candidate_id: record.candidate_id,
    revision: record.revision,
  };
}

export function validateCallback(payload, trustedRun, candidate, currentStep) {
  checkContract('callback', payload, 'CALLBACK_INVALID');
  validateCandidate(candidate);
  validateRefs(payload.config_refs);
  const env = payload.environment;
  requireThat(
    payload.workflow_path === '.github/workflows/' + workflows[env] + '.yml' &&
      payload.namespace === targets[env].namespace &&
      payload.expected_step === env + '_deployment',
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
      payload.issue_id === candidate.release_issue_id &&
      payload.source_sha === candidate.source_sha &&
      payload.test_sha === (candidate.test_sha ?? null) &&
      payload.prod_sha === (candidate.prod_merge_sha ?? null) &&
      payload.deployed_sha ===
        {
          develop: candidate.source_sha,
          test: candidate.test_sha,
          prod: candidate.prod_merge_sha,
        }[env] &&
      payload.manifest_digest === candidate.manifest_digest &&
      same(payload.config_refs, candidate.config_refs_by_environment[env]),
    'CALLBACK_VERSION_MISMATCH',
  );
  if (payload.conclusion === 'success') {
    requireThat(
      trustedRun.deployment_verified === true,
      'DEPLOYMENT_NOT_VERIFIED',
    );
    if (env === 'develop') {
      requireThat(
        payload.run_id === candidate.build_run_id &&
          payload.run_attempt === candidate.build_run_attempt,
        'DEVELOP_RUN_MISMATCH',
      );
    }
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

  const registration = registrationFor(payload);
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
    payload_digest: fingerprint(payload),
    event_key: fingerprint([
      payload.repository,
      env,
      payload.run_id,
      payload.run_attempt,
      payload.candidate_id,
    ]),
    transition_key: fingerprint(registration),
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
    !same(state.reg, registrationFor(record)) ||
    record.run_id !== state.latest_run_id ||
    record.run_attempt < state.latest_attempt
  )
    return { ...result, action: 'record_only', code: 'STALE_OBSERVATION' };
  if (record.run_attempt !== state.latest_attempt)
    return { ...result, action: 'wait', code: 'ATTEMPT_NOT_REGISTERED' };
  return {
    ...result,
    action: 'transition',
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
