import { readFileSync } from 'node:fs';
import { signedVersions } from '../scripts/contracts.mjs';

export const sha = (hex) => hex.repeat(40);
export const digest = (hex) => 'sha256:' + hex.repeat(64);
export const id = (digit) => '00000000-0000-4000-8000-00000000000' + digit;
export const now = Date.parse('2026-11-02T00:00:00Z');
export const config = [
  {
    kind: 'ConfigMap',
    name: 'bookstore-runtime-v1',
    version: 'v1',
    uid: id('a'),
  },
];

export function candidate(stage = 'qa_ready') {
  const value = {
    schema_version: 1,
    stage,
    candidate_id: id(1),
    revision: 1,
    repository: 'ansonli-dev/react-reference-architecture',
    release_issue_id: id(2),
    source_sha: sha('a'),
    source_tree: sha('b'),
    expected_test_base_sha: sha('c'),
    expected_prod_sha: sha('d'),
    manifest_digest: digest('1'),
    config_digest: digest('2'),
    platform: 'linux/arm64',
    config_refs_by_environment: { develop: config, test: config, prod: config },
    items: [
      {
        issue_id: id(3),
        key: 'VENU-24',
        implementation_owner: id(4),
        completion_target: 'independent_review',
        spec_plan_version: '2026-11-02.2',
        scope: 'synthetic catalog deployment',
      },
    ],
    build_run_id: 100,
    build_run_attempt: 1,
    previous_good_by_environment: { develop: null, test: null, prod: null },
  };
  if (stage === 'built') return structuredClone(value);
  Object.assign(value, {
    test_sha: sha('e'),
    test_tree: sha('b'),
    test_merge: { parents: [sha('c'), sha('a')], artifact_tree: sha('b') },
  });
  if (stage === 'test_merged') return structuredClone(value);
  value.test_deployment = {
    run_id: 200,
    run_attempt: 1,
    observed_digest: digest('1'),
    config_refs: config,
    evidence_id: 'test-receipt',
  };
  if (stage === 'test_deployed') return structuredClone(value);
  value.qa_signoff = { id: 'qa-report-1', version: 1 };
  if (stage === 'promoted')
    Object.assign(value, {
      prod_merge_sha: sha('f'),
      prod_merge_tree: sha('b'),
      prod_merge: { parents: [sha('d'), sha('e')] },
    });
  return structuredClone(value);
}

export function signoff(value = candidate()) {
  return {
    ...signedVersions(value),
    ...value.qa_signoff,
    config_reviewed: true,
    report_id: 'qa-1',
    principal: 'fixture-qa',
    round: 1,
    created_at: '2026-11-01T00:00:00Z',
    expires_at: '2026-11-03T00:00:00Z',
    revoked_at: null,
    conclusion: 'passed',
  };
}

export const input = (mode = 'plan') => ({
  ...JSON.parse(
    readFileSync(
      new URL('../fixtures/valid/activation-blocked.json', import.meta.url),
      'utf8',
    ),
  ),
  mode,
});

export function controlledInput(environment = 'test') {
  const options = input('execute');
  options.environment = environment;
  options.namespace = 'rra-' + environment;
  Object.assign(options.binding, {
    authorization_id: 'fixture-authorization',
    cluster_uid: id(6),
    api_server: 'https://127.0.0.1:12345',
    registry: {
      repository: 'registry.example/bookstore',
      ca_digest: digest('9'),
      evidence_id: 'fixture-registry',
    },
    runner_admission: {
      status: 'verified',
      policy_id: 'fixture-policy',
      verified_at: '2026-11-01T00:00:00Z',
      expires_at: '2026-11-03T00:00:00Z',
    },
  });
  Object.values(options.binding.namespaces).forEach((ns, i) => {
    ns.uid = id(i + 7);
  });
  const evidence = {
    authorization_id: options.binding.authorization_id,
    cluster: {
      context: options.context,
      api_server: options.binding.api_server,
      cluster_uid: id(6),
      namespace: options.namespace,
      namespace_uid: options.binding.namespaces[environment].uid,
    },
    registry: options.binding.registry,
    admission: {
      policy_id: 'fixture-policy',
      provider_enforced: true,
      approved_workflow: true,
    },
  };
  return { options, evidence };
}
