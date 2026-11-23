import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateCallback,
  decideTransition,
  deliverCallback,
  githubAttemptPath,
} from '../scripts/callback.mjs';
import { candidate, sha, digest, id } from './samples.mjs';
const deployed = candidate('test_deployed');
const record = {
  schema_version: 1,
  repository: deployed.repository,
  workflow_id: 42,
  workflow_path: '.github/workflows/test.yml',
  workflow_sha: sha('7'),
  run_id: deployed.test_deployment.run_id,
  run_attempt: 1,
  environment: 'test',
  namespace: 'rra-test',
  candidate_id: deployed.candidate_id,
  revision: 1,
  issue_id: deployed.release_issue_id,
  source_sha: deployed.source_sha,
  test_sha: deployed.test_sha,
  prod_sha: null,
  deployed_sha: deployed.test_sha,
  manifest_digest: deployed.manifest_digest,
  config_refs: deployed.config_refs_by_environment.test,
  conclusion: 'success',
  expected_step: 'test_deployment',
  step_round: 1,
  evidence_id: deployed.test_deployment.evidence_id,
};
const trusted = (observation = record) => ({
  status: 'completed',
  authorized_workflow: true,
  record: observation,
  provenance_verified: true,
  deployment_verified: observation.conclusion === 'success',
});
const step = {
  issue_id: record.issue_id,
  step: 'test_deployment',
  round: 1,
  candidate_id: record.candidate_id,
  revision: 1,
};
const state = {
  conditional_write_verified: true,
  reg: step,
  latest_run_id: record.run_id,
  latest_attempt: 1,
  events: {},
  transitions: {},
};

test('fixed GitHub attempt endpoint and exact observed version binding', () => {
  assert.match(
    githubAttemptPath(record),
    /^\/repos\/ansonli-dev\/react-reference-architecture\/actions\/runs\/200\/attempts\/1$/,
  );
  for (const change of [
    { repository: 'example/other' },
    { workflow_id: 43 },
    { environment: 'prod' },
    { run_attempt: 2 },
    { workflow_sha: sha('e') },
    { manifest_digest: digest('9') },
    { deployed_sha: sha('9') },
    { evidence_url: 'https://example.org/untrusted' },
    { config_refs: [] },
  ])
    assert.throws(
      () =>
        validateCallback({ ...record, ...change }, trusted(), deployed, step),
      { name: 'DeliveryError' },
    );
  assert.throws(
    () =>
      validateCallback(
        record,
        { ...trusted(), status: 'in_progress' },
        deployed,
        step,
      ),
    { code: 'RUN_NOT_TERMINAL' },
  );
  assert.throws(
    () =>
      validateCallback(
        record,
        { ...trusted(), deployment_verified: false },
        deployed,
        step,
      ),
    { code: 'DEPLOYMENT_NOT_VERIFIED' },
  );
});

test('early success waits; an identical persisted observation can finish the conditional transition once', () => {
  const observation = validateCallback(record, trusted(), deployed);
  const early = decideTransition(observation, { ...state, reg: null });
  assert.equal(early.action, 'wait');
  const stored = {
    ...state,
    events: { [observation.event_key]: observation.payload_digest },
  };
  assert.equal(decideTransition(observation, stored).action, 'transition');
  assert.equal(
    decideTransition(observation, {
      ...stored,
      transitions: { [observation.transition_key]: observation.event_key },
    }).action,
    'record_only',
  );
  assert.equal(
    decideTransition(observation, {
      ...stored,
      events: { [observation.event_key]: digest('9') },
    }).action,
    'conflict',
  );
  assert.equal(
    decideTransition(observation, { ...stored, reg: { ...step, round: 2 } })
      .action,
    'record_only',
  );
  assert.equal(
    decideTransition(observation, { ...stored, reg: { ...step, revision: 2 } })
      .action,
    'record_only',
  );
  assert.equal(
    decideTransition(observation, {
      ...state,
      conditional_write_verified: false,
    }).code,
    'RECEIVER_CAPABILITY_UNVERIFIED',
  );
});

test('failure, timed out and cancelled stay distinct; old attempts never alter the tracked step', () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
    const failed = { ...record, conclusion, deployed_sha: null };
    const observation = validateCallback(failed, trusted(failed), deployed);
    assert.equal(decideTransition(observation, state).conclusion, conclusion);
    assert.equal(
      decideTransition(observation, { ...state, latest_attempt: 2 }).action,
      'record_only',
    );
    assert.equal(
      decideTransition(observation, { ...state, latest_run_id: 999 }).action,
      'record_only',
    );
  }
});

test('a terminal cancellation before either merge carries zero deployment facts', () => {
  for (const env of ['test', 'prod']) {
    const current = candidate(env === 'test' ? 'built' : 'qa_ready');
    const payload = {
      ...record,
      environment: env,
      namespace: 'rra-' + env,
      workflow_path:
        env === 'test'
          ? '.github/workflows/test.yml'
          : '.github/workflows/promote-prod.yml',
      expected_step: env + '_deployment',
      test_sha: current.test_sha ?? null,
      prod_sha: null,
      deployed_sha: null,
      conclusion: 'cancelled',
      evidence_id: 'verified-cancellation',
    };
    const observation = validateCallback(payload, trusted(payload), current);
    assert.equal(observation.record.deployed_sha, null);
    const decision = decideTransition(observation, {
      ...state,
      reg: { ...step, step: payload.expected_step },
    });
    assert.equal(decision.conclusion, 'cancelled');
    assert.equal(decision.next_step, 'infra_triage');
    const inventedSuccess = { ...payload, conclusion: 'success' };
    assert.throws(
      () =>
        validateCallback(inventedSuccess, trusted(inventedSuccess), current),
      { code: 'CALLBACK_INVALID' },
    );
  }
});

test('one develop run routes two registered implementation issues to their own smoke columns', () => {
  const ids = [id(4), id(5)];
  const proof = (payload) => ({
    ...trusted(payload),
    develop_owners: { dev_a: ids[0], dev_b: ids[1] },
  });
  const current = candidate('built');
  current.items = [
    { ...current.items[0], implementation_owner: ids[0] },
    {
      ...current.items[0],
      issue_id: '00000000-0000-4000-8000-000000000009',
      key: 'VENU-25',
      implementation_owner: ids[1],
    },
  ];
  const events = {};
  const transitions = {};
  for (const [index, lane] of ['a', 'b'].entries()) {
    const item = current.items[index];
    const payload = {
      ...record,
      environment: 'develop',
      namespace: 'rra-develop',
      workflow_path: '.github/workflows/develop.yml',
      expected_step: 'b_' + lane + '_4_wait',
      issue_id: item.issue_id,
      test_sha: null,
      deployed_sha: current.source_sha,
      run_id: current.build_run_id,
      run_attempt: current.build_run_attempt,
    };
    assert.throws(() => validateCallback(payload, trusted(payload), current), {
      code: 'DEVELOP_OWNER_MAPPING_UNVERIFIED',
    });
    const observation = validateCallback(payload, proof(payload), current);
    const active = {
      ...state,
      events,
      transitions,
      latest_run_id: payload.run_id,
      reg: {
        ...step,
        issue_id: item.issue_id,
        step: payload.expected_step,
        implementation_owner: item.implementation_owner,
      },
    };
    const decision = decideTransition(observation, active);
    assert.equal(decision.next_step, 'b_' + lane + '_4_smoke');
    events[decision.event_key] = decision.payload_digest;
    transitions[decision.transition_key] = decision.event_key;
    assert.equal(decideTransition(observation, active).action, 'record_only');
    assert.equal(
      decideTransition(observation, {
        ...active,
        transitions: {},
        latest_attempt: 2,
      }).action,
      'record_only',
    );
    assert.equal(
      decideTransition(observation, {
        ...active,
        transitions: {},
        reg: { ...active.reg, implementation_owner: ids[1 - index] },
      }).action,
      'record_only',
    );
    const failed = { ...payload, conclusion: 'failure', deployed_sha: null };
    const failedReceipt = validateCallback(failed, proof(failed), current);
    assert.equal(
      decideTransition(failedReceipt, {
        ...active,
        events: {},
        transitions: {},
      }).next_step,
      'infra_triage',
    );
    const wrong = {
      ...payload,
      expected_step: 'b_' + (lane === 'a' ? 'b' : 'a') + '_4_wait',
    };
    assert.throws(() => validateCallback(wrong, proof(wrong), current), {
      name: 'DeliveryError',
    });
  }
  assert.equal(Object.keys(events).length, 2);
});

test('transport reuses the event key, bounds retries, exits on auth failure or abort', async () => {
  const observation = validateCallback(record, trusted(), deployed);
  const keys = [];
  assert.deepEqual(
    await deliverCallback(observation, {
      capability_verified: true,
      wait: async () => {},
      send: async ({ event_key }) => {
        keys.push(event_key);
        return keys.length === 3 ? 202 : 503;
      },
    }),
    { outcome: 'accepted', attempts: 3 },
  );
  assert.deepEqual(keys, Array(3).fill(observation.event_key));
  assert.deepEqual(
    await deliverCallback(observation, {
      capability_verified: true,
      send: async () => 401,
    }),
    { outcome: 'auth_failed', attempts: 1 },
  );
  assert.deepEqual(
    await deliverCallback(observation, {
      capability_verified: true,
      signal: AbortSignal.abort(),
    }),
    { outcome: 'cancelled', attempts: 0 },
  );
  assert.equal(
    (await deliverCallback(observation, {})).code,
    'RECEIVER_CAPABILITY_UNVERIFIED',
  );
});
