import { requireThat, same, targets } from './contracts.mjs';

function matchesImageID(imageID, expected, descriptor) {
  if (typeof imageID !== 'string') return false;
  const runtimeID = imageID.replace(/^containerd:\/\//, '');
  if (
    runtimeID === descriptor.config_digest ||
    runtimeID === descriptor.manifest_digest
  )
    return true;
  return imageID.replace(/^docker-pullable:\/\//, '') === expected.image;
}

export function verifyDeployment(expected, observed, descriptor) {
  requireThat(
    descriptor?.platform === 'linux/arm64' &&
      descriptor.manifest_digest === expected.manifest_digest &&
      descriptor.config_digest === expected.config_digest &&
      descriptor.repository + '@' + descriptor.manifest_digest ===
        expected.image,
    'OCI_DESCRIPTOR_MISMATCH',
  );
  requireThat(
    observed.namespace_uid === expected.namespace_uid &&
      observed.deployment_uid === expected.deployment_uid &&
      observed.current_sha === expected.sha &&
      same(observed.template, expected.template) &&
      Number.isSafeInteger(observed.generation) &&
      observed.observed_generation === observed.generation &&
      observed.replicas === 1 &&
      observed.updated === 1 &&
      observed.ready === 1 &&
      observed.pods?.length === 1,
    'ROLLOUT_NOT_READY',
  );
  for (const pod of observed.pods) {
    requireThat(
      pod.namespace === expected.namespace &&
        pod.owner_deployment_uid === expected.deployment_uid &&
        pod.current_revision === true &&
        pod.ready === true,
      'POD_NOT_READY',
    );
    requireThat(
      pod.image === expected.image &&
        matchesImageID(pod.image_id, expected, descriptor),
      'POD_IMAGE_MISMATCH',
    );
    requireThat(
      same(pod.config_refs, expected.config_refs),
      'POD_CONFIG_MISMATCH',
    );
  }
  const { health, ready, pages } = observed.probes ?? {};
  requireThat(
    health?.status === 200 && same(health.body, { status: 'ok' }),
    'HEALTH_FAILED',
  );
  requireThat(
    ready?.status === 200 && same(ready.body, { status: 'ready' }),
    'READINESS_FAILED',
  );
  for (const locale of ['zh-CN', 'en']) {
    const page = pages?.find((item) => item.locale === locale);
    const path = '/' + locale + '/books';
    requireThat(
      page?.status === 200 &&
        page.path === path &&
        typeof page.html === 'string' &&
        page.html.includes('<html lang="' + locale + '"') &&
        page.html.includes('href="' + path + '"'),
      'CATALOG_PAGE_FAILED',
    );
  }
  return {
    outcome: 'verified',
    code: 'DEPLOYMENT_VERIFIED',
    evidence: {
      namespace: expected.namespace,
      namespace_uid: expected.namespace_uid,
      sha: expected.sha,
      manifest_digest: expected.manifest_digest,
      config_digest: expected.config_digest,
      image_id: observed.pods[0].image_id,
      config_refs: expected.config_refs,
      probes: ['/api/health', '/api/ready', '/zh-CN/books', '/en/books'],
    },
  };
}

export function probeArguments(plan) {
  return [
    'kubectl',
    '--context',
    plan.context,
    '--namespace',
    plan.namespace,
    'port-forward',
    '--address=127.0.0.1',
    'svc/bookstore',
    targets[plan.environment].port + ':3000',
  ];
}
