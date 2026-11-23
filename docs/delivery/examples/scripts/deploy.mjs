import {
  DeliveryError,
  requireThat,
  same,
  validateCandidate,
  validateRefs,
} from './contracts.mjs';
import { checkExecution, planOperation, runOperation } from './guard.mjs';
import { candidateSubject, requireIntent } from './lock.mjs';
import { probeArguments, verifyDeployment } from './verify.mjs';

const plans = new WeakMap();
const shaAnnotation = 'rra.example/deployed-sha';
const configAnnotation = 'rra.example/config-refs';

const configEnvFrom = (refs) =>
  refs.map(({ kind, name }) => ({
    [kind === 'Secret' ? 'secretRef' : 'configMapRef']: { name },
  }));

export function checkedTarget(current, options) {
  const deployment = current?.deployment;
  requireThat(
    deployment?.apiVersion === 'apps/v1' &&
      deployment.kind === 'Deployment' &&
      deployment.metadata?.name === 'bookstore' &&
      deployment.metadata.namespace === options.namespace &&
      deployment.metadata.uid &&
      deployment.metadata.resourceVersion,
    'DEPLOYMENT_TARGET_MISMATCH',
  );
  requireThat(
    current.namespace_uid &&
      current.namespace_uid ===
        options.binding.namespaces[options.environment]?.uid,
    'NAMESPACE_UID_MISMATCH',
  );
  return deployment;
}

function bookstoreContainer(template) {
  const spec = template?.spec;
  requireThat(
    template?.metadata?.labels?.app === 'bookstore' &&
      spec?.serviceAccountName === 'bookstore' &&
      spec.automountServiceAccountToken === false &&
      spec.containers?.length === 1 &&
      spec.containers[0].name === 'bookstore',
    'TEMPLATE_NOT_APPROVED',
  );
  return spec.containers[0];
}

export function prepareDeployment(
  operation,
  candidate,
  current,
  options,
  expected,
) {
  const publicPlan = planOperation({
    ...options,
    operation,
    expected_versions: {
      sha: expected.sha,
      manifest_digest: expected.manifest_digest,
      config_refs: expected.config_refs,
      namespace_uid: expected.namespace_uid,
    },
  });
  const deployment = checkedTarget(current, options);
  const container = bookstoreContainer(expected.template);
  validateRefs(expected.config_refs);
  requireThat(
    expected.namespace_uid === current.namespace_uid &&
      expected.namespace === options.namespace &&
      expected.deployment_uid === deployment.metadata.uid &&
      expected.image ===
        options.binding.registry?.repository + '@' + expected.manifest_digest &&
      /^[a-f0-9]{40}$/.test(expected.sha) &&
      /^sha256:[a-f0-9]{64}$/.test(expected.manifest_digest) &&
      /^sha256:[a-f0-9]{64}$/.test(expected.config_digest) &&
      container.image === expected.image &&
      expected.template.metadata.annotations?.[shaAnnotation] ===
        expected.sha &&
      expected.template.metadata.annotations?.[configAnnotation] ===
        JSON.stringify(expected.config_refs) &&
      same(container.envFrom, configEnvFrom(expected.config_refs)),
    'TEMPLATE_NOT_APPROVED',
  );

  const preview = { ...publicPlan, expected };
  plans.set(preview, {
    publicPlan,
    candidate: structuredClone(candidate),
    current: structuredClone(current),
    expected: structuredClone(expected),
    preview: structuredClone(preview),
  });
  return preview;
}

export function planDeploy(candidate, binding, current, options) {
  validateCandidate(candidate);
  const environment = options.environment;
  const sha = {
    develop: candidate.source_sha,
    test: candidate.test_sha,
    prod: candidate.prod_merge_sha,
  }[environment];
  requireThat(
    sha &&
      (!['test', 'prod'].includes(environment) ||
        (environment === 'test'
          ? candidate.stage === 'test_merged'
          : candidate.stage === 'promoted')),
    'DEPLOY_STAGE',
  );
  const deployment = checkedTarget(current, { ...options, binding });
  const config_refs = candidate.config_refs_by_environment[environment];
  const template = structuredClone(deployment.spec.template);
  const container = bookstoreContainer(template);
  const image = binding.registry?.repository + '@' + candidate.manifest_digest;
  container.image = image;
  container.envFrom = configEnvFrom(config_refs);
  template.metadata.annotations = {
    ...template.metadata.annotations,
    [shaAnnotation]: sha,
    [configAnnotation]: JSON.stringify(config_refs),
  };
  const expected = {
    namespace: options.namespace,
    namespace_uid: current.namespace_uid,
    deployment_uid: deployment.metadata.uid,
    image,
    sha,
    config_refs,
    manifest_digest: candidate.manifest_digest,
    config_digest: candidate.config_digest,
    template,
  };
  return prepareDeployment(
    'deploy',
    candidate,
    current,
    { ...options, binding },
    expected,
  );
}

async function verifyIntent(
  environment,
  operation,
  candidate,
  expected,
  testNamespaceUid,
  deps,
) {
  if (environment === 'develop') {
    requireThat(
      (await deps.readDevelopApproval?.(candidate, expected)) === true,
      'CANDIDATE_NOT_APPROVED',
    );
    return;
  }
  const receipt = await deps.readIntent?.();
  const intent = receipt?.authorization?.operation;
  const subject = candidateSubject(candidate);
  requireThat(
    intent?.kind === operation &&
      intent.target === environment &&
      intent.status === 'in_flight' &&
      intent.actor_job === receipt.actor_job &&
      intent.sha === expected.sha &&
      intent.digest === expected.manifest_digest &&
      testNamespaceUid &&
      receipt.authorization.namespace_uid === testNamespaceUid &&
      receipt.authorization.subject?.built_digest === subject.built_digest &&
      (environment !== 'prod' ||
        receipt.authorization.subject.test_digest === subject.test_digest),
    'LOCK_INTENT_MISMATCH',
  );
  requireIntent(receipt.lock, receipt.authorization);
}

export async function runDeployment(preview, deps) {
  const state = plans.get(preview);
  requireThat(state && same(state.preview, preview), 'INVALID_PLAN');
  const { publicPlan, candidate, current, expected } = state;
  if (publicPlan.mode === 'plan') return runOperation(publicPlan);
  const { test_namespace_uid } = await checkExecution(publicPlan, deps);
  const { operation, environment } = publicPlan;
  requireThat(
    same(await deps.readCurrent(publicPlan), current),
    'DEPLOYMENT_CHANGED',
  );
  if (operation === 'rollback') {
    requireThat(
      same(await deps.readPreviousGood(publicPlan), expected) &&
        (await deps.readRollbackApproval?.(publicPlan, expected)) === true,
      'ROLLBACK_NOT_APPROVED',
    );
  }
  const configs = await deps.readConfigs(publicPlan, expected.config_refs);
  requireThat(
    expected.config_refs.every((ref) =>
      configs?.some(
        (entry) =>
          entry.kind === ref.kind &&
          entry.name === ref.name &&
          entry.version === ref.version &&
          entry.immutable === true,
      ),
    ),
    'CONFIG_VERSION_MISSING',
  );
  // Trust relationships are read before any mutation, and Pod imageID is checked after rollout.
  const descriptors = await deps.readDescriptors(expected);
  requireThat(
    descriptors?.platform === 'linux/arm64' &&
      descriptors.repository + '@' + descriptors.manifest_digest ===
        expected.image &&
      descriptors.config_digest === expected.config_digest,
    'OCI_DESCRIPTOR_MISMATCH',
  );
  await verifyIntent(
    environment,
    operation,
    candidate,
    expected,
    test_namespace_uid,
    deps,
  );
  if (operation === 'deploy') {
    const pointer = candidate.previous_good_by_environment[environment];
    const record = current.previous_good;
    requireThat(
      pointer === null
        ? record === null
        : record &&
            same(pointer, {
              record_id: record.record_id,
              deployed_sha: record.sha,
              manifest_digest: record.manifest_digest,
            }),
      'PREVIOUS_GOOD_CHANGED',
    );
    await deps.savePreviousGood(record);
    await verifyIntent(
      environment,
      operation,
      candidate,
      expected,
      test_namespace_uid,
      deps,
    );
  }
  const replacement = structuredClone(current.deployment);
  replacement.spec.template = expected.template;
  delete replacement.status;
  await deps.replaceDeployment(replacement, publicPlan.commands[2]);
  await deps.waitRollout(publicPlan.commands[3]);
  const observed = await deps.readDeployment(publicPlan);
  const forward = await deps.portForward(probeArguments(publicPlan));
  try {
    let probes;
    try {
      probes = await forward.probe();
    } catch {
      throw new DeliveryError('PROBE_FAILED');
    }
    return verifyDeployment(expected, { ...observed, probes }, descriptors);
  } finally {
    await forward.close();
  }
}
