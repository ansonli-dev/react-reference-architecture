import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCandidate, validateSignoff } from '../scripts/contracts.mjs';
import { planOperation, runOperation } from '../scripts/guard.mjs';
import { candidate, signoff, now, input } from './samples.mjs';

test('stage facts are required only when they exist', () => {
  assert.deepEqual(validateCandidate(candidate('built')), candidate('built'));
  assert.deepEqual(
    validateCandidate(candidate('test_merged')),
    candidate('test_merged'),
  );
  assert.throws(
    () =>
      validateCandidate({ ...candidate('built'), test_sha: '1'.repeat(40) }),
    { code: 'CANDIDATE_STAGE' },
  );
  assert.throws(
    () => validateSignoff(signoff(), candidate('test_merged'), now),
    { code: 'SIGNOFF_STAGE' },
  );
});

test('bad versions, unknown keys and incomplete or duplicate changes fail closed', () => {
  const valid = candidate();
  for (const change of [
    { source_sha: '0'.repeat(40) },
    { manifest_digest: 'mutable:latest' },
    { future_field: true },
    { items: [] },
    { items: [valid.items[0], valid.items[0]] },
    { items: [{ ...valid.items[0], implementation_owner: undefined }] },
  ])
    assert.throws(() => validateCandidate({ ...valid, ...change }), {
      name: 'DeliveryError',
    });
});

test('signoff expires or is invalidated by any signed version, scope or config change', () => {
  const valid = candidate();
  for (const change of [
    { expires_at: '2026-10-31T00:00:00Z' },
    { revoked_at: '2026-11-01T00:00:00Z' },
    { test_tree: '9'.repeat(40) },
    { manifest_digest: 'sha256:' + '9'.repeat(64) },
    { items_hash: 'sha256:' + '9'.repeat(64) },
    { prod_config_refs: [] },
  ])
    assert.throws(
      () => validateSignoff({ ...signoff(), ...change }, valid, now),
      { name: 'DeliveryError' },
    );
});

test('plan is read-only, wrong targets and missing authority never call the executor', async () => {
  let calls = 0;
  const deps = {
    execute() {
      calls++;
    },
    readEvidence: () => ({
      trusted_ref: true,
      approved: true,
      labels: ['rra-local'],
    }),
  };
  assert.equal(
    (await runOperation(planOperation(input()), deps)).outcome,
    'planned',
  );
  for (const [change, code] of [
    [{ context: 'remote' }, 'WRONG_CONTEXT'],
    [{ namespace: 'rra-prod' }, 'WRONG_NAMESPACE'],
  ])
    assert.throws(() => planOperation({ ...input(), ...change }), { code });
  for (const [change, code] of [
    [{}, 'ACTIVATION_UNVERIFIED'],
    [{ authorization_id: 'venue-24' }, 'RUNNER_ADMISSION_UNAVAILABLE'],
  ]) {
    const request = input('execute');
    Object.assign(request.binding, change);
    await assert.rejects(runOperation(planOperation(request), deps), { code });
  }
  await assert.rejects(
    runOperation({ ...planOperation(input()), mode: 'execute' }, deps),
    { code: 'INVALID_PLAN' },
  );
  assert.equal(calls, 0);
});
