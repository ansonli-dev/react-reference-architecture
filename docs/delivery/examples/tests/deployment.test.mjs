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
} from './samples.mjs';
import { candidateSubject, planLockTransition } from '../scripts/lock.mjs';
import { acquire, available } from './lock-samples.mjs';

function sample() {
  const value = candidate('test_merged');
  const { options, evidence } = controlledInput();
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
  const current = { deployment, namespace_uid: id(8), previous_good: null };
  const calls = [];
  const { request, evidence: proof } = acquire();
  const lock = planLockTransition(available(), request, proof, now);
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
  const held = planLockTransition(
    lock,
    {
      kind: 'record_intent',
      actor: lock.holder,
      generation: lock.generation,
      operation,
    },
    proof,
    now,
  );
  const plan = planDeploy(value, options.binding, current, options);
  const deps = {
    now: () => now,
    readEvidence: async () => evidence,
    readCurrent: async () => current,
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
  await assert.rejects(runDeployment(rollback, deps), {
    code: 'CONFIG_VERSION_MISSING',
  });
  assert.deepEqual(calls, []);
  deps.readConfigs = async () =>
    previous.config_refs.map((ref) => ({ ...ref, immutable: true }));
  deps.readDeployment = async () => observed(rollback.expected);
  deps.readDescriptors = async () => descriptors(rollback.expected);
  assert.equal((await runDeployment(rollback, deps)).outcome, 'verified');
  assert.deepEqual(calls[0][1].spec.template, previous.template);
});
