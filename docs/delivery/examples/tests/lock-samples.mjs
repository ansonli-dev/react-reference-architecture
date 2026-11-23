import { fingerprint } from '../scripts/contracts.mjs';
import { planLockTransition } from '../scripts/lock.mjs';
import { candidate, id, now, sha, signoff } from './samples.mjs';

export const actor = (run_id) => ({
  repository: candidate().repository,
  workflow_id: 42,
  workflow_sha: sha('7'),
  run_id,
  run_attempt: 1,
  coordinator_principal: 'rra-test-coordinator',
});
export const control = (holder) => ({
  actor: holder,
  principal: holder.coordinator_principal,
  job: 'coordinator',
  latest_attempt: holder.run_attempt,
  workflow_allowed: true,
});
export function available() {
  return {
    uid: id(5),
    namespace_uid: id(8),
    resource_version: 'opaque-v1',
    phase: 'available',
    generation: 6,
    holder: null,
    subject: null,
    operation: null,
    results: [],
    grant: null,
    recovery_from: null,
  };
}
export function acquire(value = candidate('built'), holder = actor(200)) {
  return {
    request: { kind: 'acquire', actor: holder, candidate: value },
    evidence: { ...control(holder), approved_candidate: fingerprint(value) },
  };
}
function completeTestOperation(lock, value, kind) {
  const operation = {
    id: 'test-' + kind,
    kind,
    target: 'test',
    actor_job: kind === 'merge' ? 'coordinator' : 'test-deployer',
    status: 'in_flight',
    sha: kind === 'merge' ? value.source_sha : value.test_sha,
    digest: kind === 'merge' ? null : value.manifest_digest,
    result: null,
  };
  const position = { actor: lock.holder, generation: lock.generation };
  const evidence = control(lock.holder);
  const pending = planLockTransition(
    lock,
    { ...position, kind: 'record_intent', operation, candidate: value },
    evidence,
    now,
  );
  const receipt = {
    ...operation,
    status: 'succeeded',
    result: {
      sha: value.test_sha,
      tree: value.test_tree,
      digest: operation.digest,
      evidence_id:
        kind === 'merge'
          ? 'test-merge-receipt'
          : value.test_deployment.evidence_id,
    },
  };
  return planLockTransition(
    pending,
    { ...position, kind: 'complete_intent' },
    { ...evidence, operation_result: receipt },
    now,
  );
}

export function testMergedLock(value, holder = actor(200)) {
  const built = {
    ...Object.fromEntries(
      Object.keys(candidate('built')).map((key) => [key, value[key]]),
    ),
    stage: 'built',
  };
  const { request, evidence } = acquire(built, holder);
  return completeTestOperation(
    planLockTransition(available(), request, evidence, now),
    value,
    'merge',
  );
}

export function snapshot(value = candidate('test_deployed')) {
  const holder = {
    ...actor(value.test_deployment.run_id),
    run_attempt: value.test_deployment.run_attempt,
  };
  const locked = completeTestOperation(
    testMergedLock(value, holder),
    value,
    'deploy',
  );
  return planLockTransition(
    locked,
    {
      kind: 'finish_test',
      actor: locked.holder,
      generation: 7,
      candidate: value,
    },
    control(holder),
    now,
  );
}
export function handoff(
  locked,
  kind = 'handoff',
  successor = actor(300),
  value = candidate(),
  qa = signoff(value),
) {
  const grant = {
    id: 'grant-1',
    version: 1,
    kind,
    lock_uid: locked.uid,
    namespace_uid: locked.namespace_uid,
    expected_generation: locked.generation,
    subject_digest: fingerprint(locked.subject),
    predecessor: locked.holder,
    successor,
    signoff_digest: kind === 'handoff' ? fingerprint(qa) : null,
    created_at: '2026-11-01T00:00:00Z',
    expires_at: '2026-11-03T00:00:00Z',
    revoked_at: null,
  };
  return {
    request: {
      kind,
      actor: successor,
      candidate: value,
      grant_id: grant.id,
    },
    evidence: {
      ...control(successor),
      predecessor: {
        holder: locked.holder,
        terminal: true,
        latest_attempt: locked.holder.run_attempt,
        writes_quiescent: true,
        conclusion: 'success',
      },
      grant,
      signoff: qa,
    },
  };
}
