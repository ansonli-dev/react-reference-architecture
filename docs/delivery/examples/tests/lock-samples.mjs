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
export function acquire(value = candidate('built')) {
  const holder = actor(200);
  return {
    request: { kind: 'acquire', actor: holder, candidate: value },
    evidence: { ...control(holder), approved_candidate: fingerprint(value) },
  };
}
export function snapshot() {
  const { request, evidence } = acquire();
  let locked = planLockTransition(available(), request, evidence, now);
  const merged = candidate('test_deployed');
  for (const kind of ['merge', 'deploy']) {
    const operation = {
      id: 'test-' + kind,
      kind,
      target: 'test',
      actor_job: kind === 'merge' ? 'coordinator' : 'test-deployer',
      status: 'in_flight',
      sha: kind === 'merge' ? merged.source_sha : merged.test_sha,
      digest: kind === 'merge' ? null : merged.manifest_digest,
      result: null,
    };
    locked = planLockTransition(
      locked,
      { kind: 'record_intent', actor: locked.holder, generation: 7, operation },
      evidence,
      now,
    );
    const receipt = {
      ...operation,
      status: 'succeeded',
      result: {
        sha: merged.test_sha,
        tree: merged.test_tree,
        digest: operation.digest,
        evidence_id: 'test-receipt',
      },
    };
    locked = planLockTransition(
      locked,
      { kind: 'complete_intent', actor: locked.holder, generation: 7 },
      { ...evidence, operation_result: receipt },
      now,
    );
  }
  return planLockTransition(
    locked,
    {
      kind: 'finish_test',
      actor: locked.holder,
      generation: 7,
      candidate: merged,
    },
    evidence,
    now,
  );
}
export function handoff(locked, kind = 'handoff', successor = actor(300)) {
  const qa = signoff();
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
      candidate: candidate(),
      grant_id: grant.id,
    },
    evidence: {
      ...control(successor),
      predecessor: {
        holder: locked.holder,
        terminal: true,
        latest_attempt: 1,
        writes_quiescent: true,
        conclusion: 'success',
      },
      grant,
      signoff: qa,
    },
  };
}
