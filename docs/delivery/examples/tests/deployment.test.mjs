import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planDeploy, runDeployment } from '../scripts/deploy.mjs';
import { planRollback } from '../scripts/rollback.mjs';
import { verifyDeployment } from '../scripts/verify.mjs';
import {
  candidate,
  config,
  controlledInput,
  id,
  now,
  sha,
  digest,
  signoff,
} from './samples.mjs';
import {
  candidateSubject,
  planLockTransition,
  recoveryIntentDigest,
} from '../scripts/lock.mjs';
import {
  actor,
  control,
  handoff,
  snapshot,
  testMergedLock,
} from './lock-samples.mjs';

function sample(environment = 'test', preauthorized) {
  const value = candidate(environment === 'prod' ? 'promoted' : 'test_merged');
  const { options, evidence } = controlledInput(environment);
  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'bookstore',
      namespace: options.namespace,
      uid: id(9),
      resourceVersion: 'v1',
    },
    spec: {
      template: {
        metadata: { labels: { app: 'bookstore' } },
        spec: {
          serviceAccountName: 'bookstore',
          automountServiceAccountToken: false,
          containers: [
            {
              name: 'bookstore',
              image: 'registry.invalid/bookstore:unbound',
              ports: [{ containerPort: 3000 }],
            },
          ],
        },
      },
    },
  };
  const current = {
    deployment,
    namespace_uid: options.binding.namespaces[environment].uid,
    previous_good: null,
  };
  const calls = [];
  const operation = {
    id: 'test-deploy-1',
    target: 'test',
    actor_job: 'test-deployer',
    status: 'in_flight',
    kind: 'deploy',
    sha: value.test_sha,
    digest: value.manifest_digest,
    result: null,
  };
  const lock = preauthorized ?? testMergedLock(value);
  const held =
    preauthorized ??
    planLockTransition(
      lock,
      {
        kind: 'record_intent',
        actor: lock.holder,
        generation: lock.generation,
        operation,
        candidate: value,
      },
      control(lock.holder),
      now,
    );
  const plan = planDeploy(value, options.binding, current, options);
  const deps = {
    now: () => now,
    readEvidence: async () => evidence,
    readCurrent: async () => current,
    readExecutor: async () => ({
      ...held.holder,
      latest_attempt: held.holder.run_attempt,
      job: held.operation.actor_job,
      generation: held.generation,
      operation_id: held.operation.id,
    }),
    readIntent: async () => ({
      lock: held,
      authorization: held,
      actor_job: 'test-deployer',
    }),
    readConfigs: async () => config.map((ref) => ({ ...ref, immutable: true })),
    savePreviousGood: async (record) => calls.push(['save', record]),
    replaceDeployment: async (body) => calls.push(['replace', body]),
    waitRollout: async () => calls.push(['rollout']),
    readDeployment: async () => observed(plan.expected),
    readDescriptors: async () => descriptors(plan.expected),
    portForward: async () => ({
      probe: async () => probes(),
      close: async () => calls.push(['close']),
    }),
  };
  return { plan, value, options, current, deps, calls, held };
}
const probes = () => ({
  health: { status: 200, body: { status: 'ok' } },
  ready: { status: 200, body: { status: 'ready' } },
  pages: ['zh-CN', 'en'].map((locale) => ({
    locale,
    status: 200,
    path: '/' + locale + '/books',
    html:
      '<html lang="' + locale + '"><a href="/' + locale + '/books">Books</a>',
  })),
});
function observed(expected) {
  return {
    namespace_uid: expected.namespace_uid,
    current_sha: expected.sha,
    template: expected.template,
    deployment_uid: expected.deployment_uid,
    generation: 5,
    observed_generation: 5,
    replicas: 1,
    updated: 1,
    ready: 1,
    pods: [
      {
        namespace: expected.namespace,
        owner_deployment_uid: expected.deployment_uid,
        current_revision: true,
        ready: true,
        image: expected.image,
        image_id: 'containerd://' + expected.config_digest,
        config_refs: expected.config_refs,
      },
    ],
    probes: probes(),
  };
}
const descriptors = (expected) => ({
  repository: expected.image.split('@')[0],
  manifest_digest: expected.manifest_digest,
  config_digest: expected.config_digest,
  platform: 'linux/arm64',
});

test('prod recovery deploys only the reconciled version and rechecks the current operation approval and QA', async () => {
  const release = candidate('promoted');
  const qa = signoff(release);
  let lock = snapshot();
  const transfer = handoff(lock);
  lock = planLockTransition(lock, transfer.request, transfer.evidence, now);
  const merge = {
    id: 'prod-merge',
    kind: 'merge',
    target: 'prod',
    status: 'in_flight',
    actor_job: 'coordinator',
    sha: release.test_sha,
    digest: null,
    result: null,
  };
  const coordinator = { actor: lock.holder, generation: lock.generation };
  lock = planLockTransition(
    lock,
    { ...coordinator, kind: 'record_intent', operation: merge },
    transfer.evidence,
    now,
  );
  const nextActor = actor(400);
  lock = planLockTransition(
    lock,
    { kind: 'mark_recovery', actor: nextActor },
    {
      ...control(nextActor),
      predecessor: {
        holder: lock.holder,
        terminal: true,
        latest_attempt: 1,
        conclusion: 'cancelled',
      },
    },
    now,
  );
  const recovery = handoff(lock, 'recover', nextActor, release, qa);
  recovery.evidence.recovery_phase = 'prod_active';
  recovery.evidence.reconciled = {
    ...merge,
    status: 'succeeded',
    result: {
      sha: release.prod_merge_sha,
      tree: release.prod_merge_tree,
      digest: null,
      evidence_id: 'verified-merge',
    },
  };
  lock = planLockTransition(lock, recovery.request, recovery.evidence, now);
  const op = {
    id: 'recovery-deploy',
    kind: 'deploy',
    target: 'prod',
    actor_job: 'prod-deployer',
    status: 'in_flight',
    sha: release.prod_merge_sha,
    digest: release.manifest_digest,
    result: null,
  };
  const approval = {
    intent_digest: recoveryIntentDigest(lock, op),
    created_at: qa.created_at,
    expires_at: qa.expires_at,
    revoked_at: null,
  };
  const authorized = planLockTransition(
    lock,
    {
      kind: 'record_intent',
      actor: lock.holder,
      generation: lock.generation,
      operation: op,
      candidate: release,
    },
    { ...control(lock.holder), recovery_approval: approval },
    now,
  );
  const { plan, deps, calls } = sample('prod', authorized);
  const receipt = {
    lock: authorized,
    authorization: authorized,
    current_grant: recovery.evidence.grant,
    current_qa: {
      signoff: qa,
      authorized_qa: [qa.principal],
      test_evidence: release.test_deployment,
    },
    recovery_approval: approval,
  };
  deps.readIntent = async () => ({ ...receipt, recovery_approval: null });
  await assert.rejects(runDeployment(plan, deps), {
    code: 'RECOVERY_APPROVAL_UNVERIFIED',
  });
  const wrongTree = {
    ...authorized,
    results: authorized.results.map((entry) =>
      entry.target === 'prod'
        ? { ...entry, result: { ...entry.result, tree: sha('9') } }
        : entry,
    ),
  };
  deps.readIntent = async () => ({
    ...receipt,
    lock: wrongTree,
    authorization: wrongTree,
  });
  await assert.rejects(runDeployment(plan, deps), {
    code: 'MERGE_RECEIPT_MISMATCH',
  });
  assert.deepEqual(calls, []);

  let withdrawn = false;
  const save = deps.savePreviousGood;
  deps.savePreviousGood = async (record) => {
    await save(record);
    withdrawn = true;
  };
  deps.readIntent = async () => ({
    ...receipt,
    current_qa: {
      ...receipt.current_qa,
      signoff: {
        ...qa,
        revoked_at: withdrawn ? new Date(now).toISOString() : null,
      },
    },
  });
  await assert.rejects(runDeployment(plan, deps), {
    code: 'SIGNOFF_EXPIRED_OR_REVOKED',
  });
  assert.equal(calls.filter(([kind]) => kind === 'replace').length, 0);

  deps.savePreviousGood = save;
  deps.readIntent = async () => receipt;
  assert.equal((await runDeployment(plan, deps)).outcome, 'verified');
  assert.equal(calls.filter(([kind]) => kind === 'replace').length, 1);
});

test('test_merged can first deploy and verify liveness, readiness and both catalog routes', async () => {
  const { plan, deps, calls } = sample();
  const result = await runDeployment(plan, deps);
  assert.equal(result.outcome, 'verified');
  assert.deepEqual(
    calls.map(([name]) => name),
    ['save', 'replace', 'rollout', 'close'],
  );
  assert.equal(calls[0][1], null);
  assert.equal(calls[1][1].metadata.resourceVersion, 'v1');
  assert.equal(
    calls[1][1].spec.template.spec.containers[0].image,
    plan.expected.image,
  );
});

test('wrong namespace UID, a stale or absent intent, and missing config leave the Deployment alone', async () => {
  for (const kind of ['uid', 'intent', 'configs', 'candidate']) {
    const { plan, deps, calls, held } = sample();
    if (kind === 'uid') {
      const evidence = await deps.readEvidence();
      deps.readEvidence = async () => ({
        ...evidence,
        cluster: { ...evidence.cluster, namespace_uid: id(1) },
      });
    }
    if (kind === 'intent')
      deps.readIntent = async () => ({
        lock: { ...held, generation: 99 },
        authorization: held,
        actor_job: 'test-deployer',
      });
    if (kind === 'configs') deps.readConfigs = async () => [];
    if (kind === 'candidate') {
      const other = candidateSubject({ ...candidate('built'), revision: 2 });
      deps.readIntent = async () => ({
        lock: { ...held, subject: other },
        authorization: { ...held, subject: other },
        actor_job: 'test-deployer',
      });
    }
    await assert.rejects(runDeployment(plan, deps), {
      code: {
        uid: 'NAMESPACE_UID_MISMATCH',
        intent: 'LOCK_INTENT_MISMATCH',
        configs: 'CONFIG_VERSION_MISSING',
        candidate: 'LOCK_INTENT_MISMATCH',
      }[kind],
    });
    assert.deepEqual(calls, []);
  }
});

test('an unrelated imageID, old pods and HTTP 200 for an unready shell do not verify', () => {
  const {
    plan: { expected },
  } = sample();
  for (const change of [
    (seen) => {
      seen.pods[0].image_id = 'containerd://' + digest('9');
    },
    (seen) => {
      seen.pods[0].current_revision = false;
    },
    (seen) => {
      seen.pods[0].ready = false;
    },
    (seen) => {
      seen.probes.health.body.status = 'down';
    },
    (seen) => {
      seen.probes.ready.status = 503;
    },
    (seen) => {
      seen.probes.pages[0].path = '/en/books';
    },
  ]) {
    const seen = observed(expected);
    change(seen);
    assert.throws(
      () => verifyDeployment(expected, seen, descriptors(expected)),
      { name: 'DeliveryError' },
    );
  }
});

test('an old executor attempt, job or generation cannot write with two current snapshots', async () => {
  for (const change of [
    { run_attempt: 2 },
    { latest_attempt: 2 },
    { job: 'other-job' },
    { generation: 6 },
    { operation_id: 'earlier-intent' },
  ]) {
    const { plan, deps, calls, held } = sample();
    const currentExecutor = await deps.readExecutor();
    assert.equal(currentExecutor.run_attempt, held.holder.run_attempt);
    deps.readExecutor = async () => ({ ...currentExecutor, ...change });
    await assert.rejects(runDeployment(plan, deps), {
      code: 'EXECUTOR_NOT_AUTHORIZED',
    });
    assert.deepEqual(calls, []);
  }
});

test('probe errors close the scoped port-forward without claiming success', async () => {
  const { plan, deps, calls } = sample();
  deps.portForward = async () => ({
    probe: async () => {
      throw new Error('port timed out');
    },
    close: async () => calls.push(['close']),
  });
  await assert.rejects(runDeployment(plan, deps), { code: 'PROBE_FAILED' });
  assert.equal(calls.at(-1)[0], 'close');
});

test('rollback preserves first-deploy evidence and restores the previous full template', async () => {
  const { plan, value, options, current, deps, calls, held } = sample();
  assert.throws(() => planRollback(null, options.binding, current, options), {
    code: 'NO_PREVIOUS_GOOD',
  });
  const secret = {
    kind: 'Secret',
    name: 'bookstore-runtime-secret-v1',
    version: 'v1',
    uid: id('b'),
  };
  const previous = structuredClone(plan.expected);
  Object.assign(previous, {
    record_id: 'good-1',
    sha: sha('9'),
    manifest_digest: digest('3'),
    config_digest: digest('4'),
    config_refs: [...config, secret],
  });
  previous.image = 'registry.example/bookstore@' + previous.manifest_digest;
  const container = previous.template.spec.containers[0];
  container.image = previous.image;
  previous.template.metadata.annotations['rra.example/deployed-sha'] =
    previous.sha;
  container.envFrom = [
    { configMapRef: { name: config[0].name } },
    { secretRef: { name: secret.name } },
  ];
  previous.template.metadata.annotations['rra.example/config-refs'] =
    JSON.stringify(previous.config_refs);
  current.previous_good = previous;
  const request = { ...options, candidate: value };
  const rollback = planRollback(previous, options.binding, current, request);
  deps.readPreviousGood = async () => previous;
  deps.readDescriptors = async () => descriptors(rollback.expected);
  deps.readRollbackApproval = async () => true;
  deps.readIntent = async () => {
    const result = {
      ...held,
      operation: {
        ...held.operation,
        kind: 'rollback',
        sha: previous.sha,
        digest: previous.manifest_digest,
      },
    };
    return { lock: result, authorization: result, actor_job: 'test-deployer' };
  };
  for (const kind of ['ConfigMap', 'Secret']) {
    deps.readConfigs = async () =>
      previous.config_refs
        .filter((ref) => ref.kind !== kind)
        .map((ref) => ({ ...ref, immutable: true }));
    await assert.rejects(runDeployment(rollback, deps), {
      code: 'CONFIG_VERSION_MISSING',
    });
    assert.deepEqual(calls, []);
    deps.readConfigs = async () =>
      previous.config_refs.map((ref) => ({
        ...ref,
        uid: ref.kind === kind ? id(1) : ref.uid,
        immutable: true,
      }));
    await assert.rejects(runDeployment(rollback, deps), {
      code: 'CONFIG_IDENTITY_MISMATCH',
    });
    assert.deepEqual(calls, []);
  }
  deps.readConfigs = async () =>
    previous.config_refs.map((ref) => ({ ...ref, immutable: true }));
  deps.readDeployment = async () => observed(rollback.expected);
  assert.equal((await runDeployment(rollback, deps)).outcome, 'verified');
  assert.deepEqual(calls[0][1].spec.template, previous.template);
});
