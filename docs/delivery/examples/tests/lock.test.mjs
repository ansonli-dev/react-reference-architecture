import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planLockTransition, replaceLock } from '../scripts/lock.mjs';
import { acquire, handoff, control, snapshot } from './lock-samples.mjs';
import { candidate, now, sha } from './samples.mjs';
import { fingerprint } from '../scripts/contracts.mjs';

test('one opaque resourceVersion transfers the holder with no open QA window', async () => {
  const locked = snapshot();
  const { request, evidence } = handoff(locked);
  const next = planLockTransition(locked, request, evidence, now);
  assert.equal(next.resource_version, locked.resource_version);
  assert.equal(next.phase, 'prod_active');
  assert.equal(next.generation, 8);
  assert.deepEqual(next.subject, locked.subject);
  assert.deepEqual(next.holder, request.actor);
  const writes = [];
  await replaceLock(next, {
    replaceConfigMap: async (body) => {
      writes.push(body);
      return { ...next, resource_version: 'opaque-v2' };
    },
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].metadata.resourceVersion, locked.resource_version);
  for (const state of [locked, next]) {
    const another = acquire({
      ...candidate('built'),
      candidate_id: '00000000-0000-4000-8000-000000000008',
    });
    assert.throws(
      () => planLockTransition(state, another.request, another.evidence, now),
      { code: 'LOCK_OCCUPIED' },
    );
  }
});

test('409 never retries and only exact successor/grant replay can recover a receipt', async () => {
  const locked = snapshot();
  const { request, evidence } = handoff(locked);
  const next = planLockTransition(locked, request, evidence, now);
  let calls = 0;
  const deps = {
    replaceConfigMap: async () => {
      calls++;
      throw { status: 409 };
    },
    readLock: async () => locked,
  };
  await assert.rejects(replaceLock(next, deps), { code: 'LOCK_CONFLICT' });
  assert.equal(calls, 1);
  const equal = { ...next, resource_version: 'version-two' };
  const receipt = await replaceLock(next, {
    ...deps,
    readLock: async () => equal,
    readCurrentGrant: async () => evidence.grant,
  });
  assert.equal(receipt.outcome, 'already_current');
  const intent = planLockTransition(
    equal,
    {
      kind: 'record_intent',
      actor: next.holder,
      generation: 8,
      operation: {
        id: 'prod-merge-1',
        kind: 'merge',
        target: 'prod',
        actor_job: 'coordinator',
        status: 'in_flight',
        sha: candidate().test_sha,
        digest: null,
        result: null,
      },
    },
    control(next.holder),
    now,
  );
  await assert.rejects(
    replaceLock(intent, {
      ...deps,
      readLock: async () => intent,
      readCurrentGrant: async () => evidence.grant,
    }),
    { code: 'LOCK_CONFLICT' },
  );
});

test('two successors using the same resourceVersion cannot both acquire the candidate', async () => {
  let live = snapshot();
  const a = handoff(live);
  const b = handoff(live, 'handoff', { ...a.request.actor, run_id: 301 });
  const nextA = planLockTransition(live, a.request, a.evidence, now);
  const nextB = planLockTransition(live, b.request, b.evidence, now);
  const writes = [];
  const deps = {
    readLock: async () => live,
    readCurrentGrant: async () => a.evidence.grant,
    replaceConfigMap: async (body) => {
      if (body.metadata.resourceVersion !== live.resource_version)
        throw { status: 409 };
      live = {
        uid: live.uid,
        resource_version: 'next-rv',
        ...JSON.parse(body.data.state),
      };
      writes.push(live.holder.run_id);
      return live;
    },
  };
  const outcomes = await Promise.allSettled([
    replaceLock(nextA, deps),
    replaceLock(nextB, deps),
  ]);
  assert.deepEqual(
    outcomes.map(({ status }) => status),
    ['fulfilled', 'rejected'],
  );
  assert.equal(outcomes[1].reason.code, 'LOCK_CONFLICT');
  assert.deepEqual(writes, [300]);
});

test('finalization needs a directed QA grant and archive; interruption keeps the candidate', () => {
  let locked = snapshot();
  const transfer = handoff(locked);
  locked = planLockTransition(locked, transfer.request, transfer.evidence, now);
  const prod = candidate('promoted');
  locked = {
    ...locked,
    phase: 'prod_qa_window',
    results: [
      ...locked.results,
      {
        id: 'prod-deploy-1',
        kind: 'deploy',
        target: 'prod',
        actor_job: 'prod-deployer',
        status: 'succeeded',
        sha: prod.prod_merge_sha,
        digest: prod.manifest_digest,
        result: {
          sha: prod.prod_merge_sha,
          tree: prod.prod_merge_tree,
          digest: prod.manifest_digest,
          evidence_id: 'verified-prod',
        },
      },
    ],
  };
  const finalized = handoff(locked, 'finalize', {
    ...locked.holder,
    run_id: 500,
  });
  finalized.request.candidate = prod;
  const approved = {
    candidate_id: prod.candidate_id,
    revision: prod.revision,
    prod_sha: prod.prod_merge_sha,
    manifest_digest: prod.manifest_digest,
    config_refs: prod.config_refs_by_environment.prod,
    conclusion: 'passed',
    created_at: '2026-11-01T00:00:00Z',
    expires_at: '2026-11-03T00:00:00Z',
    revoked_at: null,
  };
  finalized.evidence.grant.signoff_digest = fingerprint(approved);
  assert.throws(
    () =>
      planLockTransition(locked, finalized.request, finalized.evidence, now),
    { code: 'HANDOFF_AUTHORITY_UNVERIFIED' },
  );
  finalized.evidence.final_qa = approved;
  const finalizing = planLockTransition(
    locked,
    finalized.request,
    finalized.evidence,
    now,
  );
  const release = {
    kind: 'release',
    actor: finalizing.holder,
    generation: finalizing.generation,
  };
  const writer = control(finalizing.holder);
  assert.throws(() => planLockTransition(finalizing, release, writer, now), {
    code: 'RELEASE_NOT_VERIFIED',
  });
  const cancelled = planLockTransition(
    finalizing,
    { kind: 'mark_recovery', actor: finalizing.holder },
    {
      ...writer,
      predecessor: {
        holder: finalizing.holder,
        terminal: true,
        latest_attempt: 1,
        conclusion: 'cancelled',
      },
    },
    now,
  );
  assert.deepEqual(cancelled.subject, finalizing.subject);
  assert.equal(cancelled.phase, 'recovery_required');
  assert.equal(
    planLockTransition(
      finalizing,
      release,
      { ...writer, archive_digest: fingerprint(finalizing) },
      now,
    ).phase,
    'available',
  );
});

test('missing, redirected, expired or revoked grants, and non-coordinator identities are rejected', () => {
  const locked = snapshot();
  const { request, evidence } = handoff(locked);
  for (const change of [
    null,
    { ...evidence.grant, successor: locked.holder },
    { ...evidence.grant, expires_at: '2026-11-02T00:00:00Z' },
    { ...evidence.grant, revoked_at: '2026-11-01T00:00:00Z' },
  ]) {
    assert.throws(
      () =>
        planLockTransition(
          locked,
          request,
          { ...evidence, grant: change },
          now,
        ),
      { code: 'HANDOFF_AUTHORITY_UNVERIFIED' },
    );
  }
  for (const principal of [
    'rra-test-lock-reader',
    'rra-prod-deployer',
    'QA',
    'TL',
  ]) {
    for (const kind of ['handoff', 'release', 'record_intent']) {
      assert.throws(
        () =>
          planLockTransition(
            locked,
            { ...request, kind },
            { ...evidence, principal },
            now,
          ),
        { code: 'LOCK_WRITER_UNAUTHORIZED' },
      );
    }
  }
});

test('a cancellation request and uncertain operation preserve the candidate until reconciliation', () => {
  let locked = snapshot();
  const transfer = handoff(locked);
  for (const change of [
    { terminal: false },
    { latest_attempt: 2 },
    { writes_quiescent: false },
  ]) {
    assert.throws(
      () =>
        planLockTransition(
          locked,
          transfer.request,
          {
            ...transfer.evidence,
            predecessor: { ...transfer.evidence.predecessor, ...change },
          },
          now,
        ),
      { code: 'PREDECESSOR_NOT_QUIESCENT' },
    );
  }
  locked = planLockTransition(locked, transfer.request, transfer.evidence, now);
  const operation = {
    id: 'prod-merge',
    kind: 'merge',
    target: 'prod',
    actor_job: 'coordinator',
    status: 'in_flight',
    sha: candidate().test_sha,
    digest: null,
    result: null,
  };
  locked = planLockTransition(
    locked,
    { kind: 'record_intent', actor: locked.holder, generation: 8, operation },
    control(locked.holder),
    now,
  );
  const predecessor = {
    holder: locked.holder,
    terminal: true,
    latest_attempt: 1,
    writes_quiescent: false,
    conclusion: 'cancelled',
  };
  const nextActor = { ...locked.holder, run_id: 400 };
  locked = planLockTransition(
    locked,
    { kind: 'mark_recovery', actor: nextActor },
    { ...control(nextActor), predecessor },
    now,
  );
  assert.equal(locked.phase, 'recovery_required');
  assert.equal(locked.operation.id, operation.id);
  const recover = handoff(locked, 'recover', nextActor);
  assert.throws(
    () => planLockTransition(locked, recover.request, recover.evidence, now),
    { code: 'PREDECESSOR_NOT_QUIESCENT' },
  );
  recover.evidence.reconciled = {
    ...operation,
    status: 'succeeded',
    result: {
      sha: sha('f'),
      tree: sha('b'),
      digest: null,
      evidence_id: 'checked-merge',
    },
  };
  recover.evidence.recovery_phase = 'prod_active';
  const restored = planLockTransition(
    locked,
    recover.request,
    recover.evidence,
    now,
  );
  assert.equal(restored.generation, 9);
  assert.equal(restored.phase, 'prod_active');
  assert.equal(restored.results.at(-1).result.sha, sha('f'));
  assert.throws(
    () =>
      planLockTransition(
        restored,
        {
          kind: 'record_intent',
          actor: locked.holder,
          generation: 8,
          operation,
        },
        control(locked.holder),
        now,
      ),
    { code: 'LOCK_HOLDER_MISMATCH' },
  );
  assert.throws(
    () =>
      planLockTransition(
        restored,
        { kind: 'record_intent', actor: nextActor, generation: 9, operation },
        control(nextActor),
        now,
      ),
    { code: 'OPERATION_ALREADY_APPLIED' },
  );
});
