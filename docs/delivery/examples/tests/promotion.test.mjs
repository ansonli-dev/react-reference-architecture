import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprint, itemsHash } from '../scripts/contracts.mjs';
import { planOperation } from '../scripts/guard.mjs';
import { executePromotion, validatePromotion } from '../scripts/promote.mjs';
import {
  actor,
  available,
  control,
  handoff,
  snapshot,
} from './lock-samples.mjs';
import {
  candidate,
  signoff,
  controlledInput,
  digest,
  now,
  sha,
} from './samples.mjs';

function scenario(environment = 'prod', preset = {}) {
  const prod = environment === 'prod';
  const value = preset.value ?? candidate(prod ? 'qa_ready' : 'built');
  const qa = prod ? signoff(value) : null;
  const { options, evidence } = controlledInput(environment);
  const gate = planOperation({
    ...options,
    operation: 'promote',
    expected_versions: {
      test_namespace_uid: options.binding.namespaces.test.uid,
    },
  });
  const coordinator = actor(prod ? 300 : 200);
  let lock = prod ? snapshot(value) : available();
  const handoffProof = prod
    ? handoff(lock, 'handoff', coordinator, value, qa).evidence
    : null;
  const source = prod ? value.test_sha : value.source_sha;
  const target = prod ? value.expected_prod_sha : value.expected_test_base_sha;
  const merge_sha = prod ? sha('f') : sha('e');
  const state = {
    environment,
    refs: { source, target },
    tree: { source, target, tree: value.source_tree },
    review: {
      head: source,
      author: 'dev',
      approver: 'tl',
      pr_number: 17,
      checks_head: source,
      checks_passed: true,
      authorized_approvers: ['tl'],
      repository: value.repository,
      head_ref: prod ? 'test' : 'develop',
      base_ref: environment,
    },
    rules: {
      approved_digest: digest('8'),
      effective_digest: digest('8'),
      writer_app_id: 70,
      writers: [70],
      quality_bypass: [],
      admins_excluded: true,
      all_writers_use_lock: true,
      source_frozen: true,
    },
    inventory_hash: itemsHash(value.items),
    signoff: qa,
    authorized_qa: ['fixture-qa'],
    test_evidence: value.test_deployment,
    develop_evidence: {
      sha: value.source_sha,
      tree: value.source_tree,
      manifest_digest: value.manifest_digest,
      run_id: value.build_run_id,
      run_attempt: value.build_run_attempt,
      self_tested: true,
    },
  };
  const calls = [];
  const deps = {
    gate,
    now: () => now,
    readEvidence: async () => evidence,
    readTrustedState: async () => state,
    readRefs: async () => state.refs,
    readControl: async () => ({
      ...control(coordinator),
      ...handoffProof,
      approved_candidate: fingerprint(value),
    }),
    readLock: async () => lock,
    readCurrentGrant: async () => handoffProof?.grant,
    replaceConfigMap: async (body) => {
      calls.push(['cas', body]);
      if (lock.resource_version !== body.metadata.resourceVersion)
        throw { status: 409 };
      lock = {
        uid: lock.uid,
        resource_version: 'opaque-' + calls.length,
        ...JSON.parse(body.data.state),
      };
      return lock;
    },
    mergePullRequest: async (body) => {
      calls.push(['merge', body]);
      state.refs = { source, target: merge_sha };
      return { merged: true, sha: merge_sha };
    },
    readCommit: async () => ({
      sha: merge_sha,
      tree: value.source_tree,
      parents: [target, source],
    }),
    deploy: async (release) => {
      calls.push(['deploy', release]);
      return {
        outcome: 'verified',
        evidence: {
          namespace: options.namespace,
          sha: merge_sha,
          manifest_digest: value.manifest_digest,
          config_refs: value.config_refs_by_environment[environment],
        },
      };
    },
  };
  return { value, qa, state, deps, calls, coordinator, getLock: () => lock };
}
function plan(sample) {
  return validatePromotion(sample.value, sample.qa, sample.state, now);
}

test('an old QA approval cannot promote a redeployment of the same commit and image', () => {
  for (const change of [{ run_attempt: 2 }, { evidence_id: 'new-receipt' }]) {
    const sample = scenario();
    const redeployed = {
      ...sample.value,
      test_deployment: { ...sample.value.test_deployment, ...change },
    };
    const state = {
      ...sample.state,
      test_evidence: redeployed.test_deployment,
    };
    assert.throws(() => validatePromotion(redeployed, sample.qa, state, now), {
      code: 'SIGNOFF_VERSION_MISMATCH',
    });
    assert.deepEqual(sample.calls, []);
  }
});

test('a freshly signed test receipt permits promotion of the redeployed artifact', async () => {
  const value = candidate();
  value.test_deployment = {
    ...value.test_deployment,
    run_attempt: 2,
    evidence_id: 'test-receipt-2',
  };
  value.qa_signoff = { ...value.qa_signoff, version: 2 };
  const sample = scenario('prod', { value });
  const result = await executePromotion(plan(sample), sample.deps);
  assert.equal(result.outcome, 'verified');
  assert.deepEqual(
    sample.calls
      .filter(([kind]) => kind === 'merge' || kind === 'deploy')
      .map(([kind]) => kind),
    ['merge', 'deploy'],
  );
});

test('revocation during deployment-intent CAS leaves the verified merge and makes zero deployments', async () => {
  const sample = scenario();
  const replace = sample.deps.replaceConfigMap;
  sample.deps.replaceConfigMap = async (body) => {
    const saved = await replace(body);
    if (saved.operation?.kind === 'deploy')
      sample.state.signoff = {
        ...sample.state.signoff,
        revoked_at: '2026-11-02T00:00:00Z',
      };
    return saved;
  };
  const result = await executePromotion(plan(sample), sample.deps);
  assert.equal(result.merged, true);
  assert.equal(result.deployed, false);
  assert.equal(result.code, 'QA_AUTHORITY_UNVERIFIED');
  assert.equal(sample.calls.filter(([kind]) => kind === 'merge').length, 1);
  assert.equal(sample.calls.filter(([kind]) => kind === 'deploy').length, 0);
});

test('test reserves before merge and holds during QA; prod takes over then deploys the signed digest', async () => {
  for (const env of ['test', 'prod']) {
    const sample = scenario(env);
    const result = await executePromotion(plan(sample), sample.deps);
    assert.equal(result.outcome, 'verified');
    assert.equal(result.merged, true);
    assert.equal(result.deployed, true);
    assert.equal(
      sample.getLock().phase,
      env === 'test' ? 'qa_window' : 'prod_qa_window',
    );
    assert.deepEqual(
      sample.calls.map(([call]) => call),
      ['cas', 'cas', 'merge', 'cas', 'cas', 'deploy', 'cas', 'cas'],
    );
    assert.equal(
      sample.calls[2][1].sha,
      env === 'prod' ? sample.value.test_sha : sample.value.source_sha,
    );
    assert.equal(
      sample.calls[5][1].manifest_digest,
      sample.value.manifest_digest,
    );
  }
});

test('authorization and version or policy drift reach neither merge nor deploy', async () => {
  for (const [change, code] of [
    [
      (s) => {
        s.refs.source = sha('9');
      },
      'SOURCE_CHANGED',
    ],
    [
      (s) => {
        s.refs.target = sha('9');
      },
      'TARGET_CHANGED',
    ],
    [
      (s) => {
        s.tree.tree = sha('9');
      },
      'MERGE_TREE_CHANGED',
    ],
    [
      (s) => {
        s.review.approver = s.review.author;
      },
      'REVIEW_UNVERIFIED',
    ],
    [
      (s) => {
        s.authorized_qa = [];
      },
      'QA_AUTHORITY_UNVERIFIED',
    ],
    [
      (s) => {
        s.signoff = { ...s.signoff, version: 2 };
      },
      'QA_AUTHORITY_UNVERIFIED',
    ],
    [
      (s) => {
        s.inventory_hash = digest('9');
      },
      'SCOPE_MISMATCH',
    ],
    [
      (s) => {
        s.rules.admins_excluded = false;
      },
      'TARGET_GUARD_UNAVAILABLE',
    ],
    [
      (s) => {
        s.rules.writers.push(71);
      },
      'TARGET_GUARD_UNAVAILABLE',
    ],
    [
      (s) => {
        s.rules.all_writers_use_lock = false;
      },
      'TARGET_GUARD_UNAVAILABLE',
    ],
    [
      (s) => {
        s.rules.quality_bypass = [70];
      },
      'TARGET_GUARD_UNAVAILABLE',
    ],
    [
      (s) => {
        s.rules.effective_digest = digest('9');
      },
      'TARGET_GUARD_UNAVAILABLE',
    ],
  ]) {
    const sample = scenario();
    const prepared = plan(sample);
    change(sample.state);
    const result = await executePromotion(prepared, sample.deps);
    assert.equal(result.code, code);
    assert.deepEqual(sample.calls, []);
  }
});

test('missing grant, canceled predecessor and CAS conflict cause zero mutation downstream', async () => {
  for (const [tweak, code] of [
    [
      (s) => {
        const read = s.deps.readControl;
        s.deps.readControl = async () => ({ ...(await read()), grant: null });
      },
      'HANDOFF_AUTHORITY_UNVERIFIED',
    ],
    [
      (s) => {
        const read = s.deps.readControl;
        s.deps.readControl = async () => {
          const proof = await read();
          return {
            ...proof,
            predecessor: { ...proof.predecessor, terminal: false },
          };
        };
      },
      'PREDECESSOR_NOT_QUIESCENT',
    ],
    [
      (s) => {
        s.deps.replaceConfigMap = async () => {
          throw { status: 409 };
        };
      },
      'LOCK_CONFLICT',
    ],
  ]) {
    const sample = scenario();
    tweak(sample);
    const result = await executePromotion(plan(sample), sample.deps);
    assert.equal(result.code, code);
    assert.deepEqual(sample.calls, []);
  }
});

test('head protection failure and post-merge tree mismatch are recorded distinctly', async () => {
  const denied = scenario();
  denied.deps.mergePullRequest = async ({ sha: head }) => {
    assert.equal(head, denied.value.test_sha);
    denied.state.refs.source = sha('9');
    return { merged: denied.state.refs.source === head };
  };
  const rejected = await executePromotion(plan(denied), denied.deps);
  assert.equal(rejected.code, 'MERGE_REJECTED');
  assert.equal(rejected.merged, false);
  assert.equal(rejected.deployed, false);
  const changed = scenario();
  changed.deps.readCommit = async () => ({
    sha: sha('f'),
    tree: sha('9'),
    parents: [sha('d'), sha('e')],
  });
  const actual = await executePromotion(plan(changed), changed.deps);
  assert.equal(actual.code, 'MERGE_RESULT_MISMATCH');
  assert.equal(actual.merged, true);
  assert.equal(actual.deployed, false);
  assert.equal(changed.getLock().operation.kind, 'merge');
});

test('a stale lock after an intent write prevents the merge', async () => {
  const sample = scenario();
  const read = sample.deps.readLock;
  sample.deps.readLock = async () => {
    const current = await read();
    return current.operation ? { ...current, generation: 99 } : current;
  };
  const result = await executePromotion(plan(sample), sample.deps);
  assert.equal(result.code, 'LOCK_INTENT_MISMATCH');
  assert.equal(
    sample.calls.filter(([kind]) => kind === 'merge' || kind === 'deploy')
      .length,
    0,
  );
});
