import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  DeliveryError,
  requireThat,
  same,
  targets,
  validateBinding,
} from './contracts.mjs';

const inputs = new WeakMap();

export function planOperation({
  operation,
  mode = 'plan',
  environment,
  context,
  namespace,
  binding,
  expected_versions = {},
}) {
  requireThat(
    ['deploy', 'verify', 'rollback', 'promote', 'callback'].includes(operation),
    'UNKNOWN_OPERATION',
  );
  requireThat(['plan', 'execute'].includes(mode), 'INVALID_MODE');
  requireThat(context === 'docker-desktop', 'WRONG_CONTEXT');
  requireThat(
    Object.hasOwn(targets, environment) &&
      namespace === targets[environment].namespace,
    'WRONG_NAMESPACE',
  );
  validateBinding(binding);
  const blockers = [];
  if (!binding.authorization_id) blockers.push('ACTIVATION_UNVERIFIED');
  if (binding.runner_admission.status !== 'verified')
    blockers.push('RUNNER_ADMISSION_UNAVAILABLE');
  if (
    !binding.cluster_uid ||
    !binding.api_server ||
    !binding.namespaces[environment].uid
  )
    blockers.push('NAMESPACE_IDENTITY_UNVERIFIED');
  if (!binding.registry) blockers.push('REGISTRY_UNVERIFIED');
  const kubectl = ['kubectl', '--context', context, '--namespace', namespace];
  const commands = [
    [...kubectl, 'get', 'namespace', namespace, '-o', 'json'],
    [...kubectl, 'get', 'deployment/bookstore', '-o', 'json'],
  ];
  if (operation === 'deploy' || operation === 'rollback') {
    commands.push(
      [...kubectl, 'replace', '-f', '-'],
      [
        ...kubectl,
        'rollout',
        'status',
        'deployment/bookstore',
        '--timeout=180s',
      ],
    );
  }
  const plan = {
    mode,
    operation,
    environment,
    context,
    namespace,
    expected_versions,
    commands,
    blockers,
  };
  inputs.set(plan, structuredClone({ plan, binding }));
  return plan;
}

export async function checkExecution(plan, deps) {
  requireThat(inputs.has(plan), 'INVALID_PLAN');
  const { plan: checked, binding } = inputs.get(plan);
  requireThat(
    same(plan, checked) && checked.mode === 'execute',
    'INVALID_PLAN',
  );
  requireThat(!checked.blockers.length, checked.blockers[0]);
  const evidence = await deps?.readEvidence?.(checked, binding);
  const admission = binding.runner_admission;
  const now = deps?.now?.() ?? Date.now();
  requireThat(
    admission.policy_id &&
      Date.parse(admission.verified_at) <= now &&
      Date.parse(admission.expires_at) > now &&
      evidence?.admission?.policy_id === admission.policy_id &&
      evidence.admission.provider_enforced === true &&
      evidence.admission.approved_workflow === true,
    'RUNNER_ADMISSION_UNAVAILABLE',
  );
  requireThat(
    evidence.authorization_id === binding.authorization_id,
    'ACTIVATION_UNVERIFIED',
  );
  requireThat(
    same(evidence.cluster, {
      context: checked.context,
      api_server: binding.api_server,
      cluster_uid: binding.cluster_uid,
      namespace: checked.namespace,
      namespace_uid: binding.namespaces[checked.environment].uid,
    }),
    'NAMESPACE_UID_MISMATCH',
  );
  requireThat(same(evidence.registry, binding.registry), 'REGISTRY_UNVERIFIED');
  return { ...checked, test_namespace_uid: binding.namespaces.test.uid };
}

export async function runOperation(plan, deps) {
  requireThat(
    inputs.has(plan) && same(plan, inputs.get(plan).plan),
    'INVALID_PLAN',
  );
  if (plan.mode === 'plan')
    return { outcome: 'planned', code: 'PLAN_ONLY', evidence: plan };
  const checked = await checkExecution(plan, deps);
  requireThat(typeof deps.execute === 'function', 'EXECUTOR_UNAVAILABLE');
  return deps.execute(checked);
}

async function main() {
  try {
    // File inputs are untrusted. The CLI has no live evidence readers or executors.
    const {
      values,
      positionals: [file, ...otherFiles],
    } = parseArgs({
      allowPositionals: true,
      options: { mode: { type: 'string' }, environment: { type: 'string' } },
    });
    requireThat(file && !otherFiles.length, 'INVALID_INPUT');
    const input = JSON.parse(readFileSync(file, 'utf8'));
    if (values.mode) input.mode = values.mode;
    if (values.environment) {
      requireThat(
        Object.hasOwn(targets, values.environment),
        'WRONG_NAMESPACE',
      );
      input.environment = values.environment;
      input.namespace = targets[values.environment].namespace;
    }
    const { outcome, code, evidence } = await runOperation(
      planOperation({ ...input, expected_versions: {} }),
    );
    process.stdout.write(
      JSON.stringify({ outcome, code, evidence }, null, 2) + '\n',
    );
  } catch (error) {
    process.stderr.write(
      (error instanceof DeliveryError ? error.code : 'INVALID_INPUT') + '\n',
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();
