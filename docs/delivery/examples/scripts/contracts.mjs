import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const repository = 'ansonli-dev/react-reference-architecture';
export const targets = Object.freeze({
  develop: { namespace: 'rra-develop', port: 3100 },
  test: { namespace: 'rra-test', port: 3200 },
  prod: { namespace: 'rra-prod', port: 3300 },
});

export class DeliveryError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DeliveryError';
    this.code = code;
  }
}

export function requireThat(condition, code) {
  if (!condition) throw new DeliveryError(code);
}

const schemas = new Map();
function readSchema(name) {
  if (!schemas.has(name)) {
    const url = new URL(
      '../contracts/' + name + '.schema.json',
      import.meta.url,
    );
    schemas.set(name, JSON.parse(readFileSync(url, 'utf8')));
  }
  return schemas.get(name);
}

// The example contracts use this small subset of JSON Schema. Their fixtures
// are also checked with a standard Draft 2020-12 validator.
function conforms(rule, value) {
  if (rule.$ref) return conforms(readSchema(rule.$ref.split('.')[0]), value);
  if (rule.anyOf) return rule.anyOf.some((choice) => conforms(choice, value));
  if (
    rule.oneOf &&
    rule.oneOf.filter((choice) => conforms(choice, value)).length !== 1
  )
    return false;
  if (rule.not && conforms(rule.not, value)) return false;
  if (Object.hasOwn(rule, 'const')) return value === rule.const;
  if (rule.enum) return rule.enum.includes(value);
  switch (rule.type) {
    case 'null':
      return value === null;
    case 'integer':
      return Number.isSafeInteger(value) && value >= rule.minimum;
    case 'string':
      return (
        typeof value === 'string' &&
        value.length >= (rule.minLength ?? 0) &&
        (!rule.pattern || new RegExp(rule.pattern, 'u').test(value))
      );
    case 'array':
      return (
        Array.isArray(value) &&
        value.length >= rule.minItems &&
        value.length <= (rule.maxItems ?? Infinity) &&
        Array.from(value).every((item) => conforms(rule.items, item))
      );
    case 'object':
      return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (rule.required ?? []).every((key) => Object.hasOwn(value, key)) &&
        Object.entries(rule.properties ?? {}).every(
          ([key, property]) =>
            !Object.hasOwn(value, key) || conforms(property, value[key]),
        ) &&
        (rule.additionalProperties !== false ||
          Object.keys(value).every((key) =>
            Object.hasOwn(rule.properties, key),
          ))
      );
    default:
      return false;
  }
}

export function checkContract(name, value, code = 'INVALID_CONTRACT') {
  requireThat(conforms(readSchema(name), value), code);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function fingerprint(value) {
  return (
    'sha256:' +
    createHash('sha256')
      .update(JSON.stringify(canonical(value)))
      .digest('hex')
  );
}

export function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export function itemsHash(items) {
  return fingerprint(
    [...items].sort((a, b) => a.issue_id.localeCompare(b.issue_id)),
  );
}

export function validateRefs(refs) {
  requireThat(Array.isArray(refs), 'CONFIG_REFS_INVALID');
  for (const ref of refs)
    checkContract('config-ref', ref, 'CONFIG_REFS_INVALID');
  const names = refs.map(({ kind, name }) => kind + '/' + name);
  requireThat(new Set(names).size === names.length, 'CONFIG_REFS_INVALID');
  return refs;
}

export function validateCandidate(value) {
  checkContract('candidate', value, 'CANDIDATE_STAGE');
  requireThat(
    new Set(value.items.map((item) => item.issue_id)).size ===
      value.items.length &&
      new Set(value.items.map((item) => item.key)).size === value.items.length,
    'CANDIDATE_ITEMS',
  );
  for (const refs of Object.values(value.config_refs_by_environment)) {
    validateRefs(refs);
    requireThat(refs.length > 0, 'CONFIG_REFS_INVALID');
  }
  if (value.test_merge) {
    requireThat(
      same(value.test_merge.parents, [
        value.expected_test_base_sha,
        value.source_sha,
      ]) &&
        value.test_tree === value.source_tree &&
        value.test_merge.artifact_tree === value.test_tree,
      'TEST_MERGE_MISMATCH',
    );
  }
  if (value.test_deployment) {
    requireThat(
      value.test_deployment.observed_digest === value.manifest_digest &&
        same(
          value.test_deployment.config_refs,
          value.config_refs_by_environment.test,
        ),
      'TEST_DEPLOYMENT_MISMATCH',
    );
  }
  if (value.prod_merge) {
    requireThat(
      value.prod_merge_tree === value.test_tree &&
        same(value.prod_merge.parents, [
          value.expected_prod_sha,
          value.test_sha,
        ]),
      'PROD_MERGE_MISMATCH',
    );
  }
  return value;
}

export function signedVersions(candidate) {
  return {
    candidate_id: candidate.candidate_id,
    revision: candidate.revision,
    test_sha: candidate.test_sha,
    test_tree: candidate.test_tree,
    manifest_digest: candidate.manifest_digest,
    items_hash: itemsHash(candidate.items),
    test_config_refs: candidate.config_refs_by_environment.test,
    prod_config_refs: candidate.config_refs_by_environment.prod,
  };
}

export function requireCurrent(record, now, code) {
  const created = Date.parse(record.created_at);
  const expires = Date.parse(record.expires_at);
  requireThat(
    record.revoked_at === null &&
      Number.isFinite(created) &&
      created <= now &&
      Number.isFinite(expires) &&
      expires > now,
    code,
  );
}

export function validateSignoff(value, candidate, now) {
  validateCandidate(candidate);
  requireThat(candidate.test_deployment, 'SIGNOFF_STAGE');
  checkContract('qa-signoff', value, 'SIGNOFF_INVALID');
  requireCurrent(value, now, 'SIGNOFF_EXPIRED_OR_REVOKED');
  const versions = signedVersions(candidate);
  requireThat(
    Object.keys(versions).every((key) => same(value[key], versions[key])),
    'SIGNOFF_VERSION_MISMATCH',
  );
  if (candidate.qa_signoff) {
    requireThat(
      same(candidate.qa_signoff, { id: value.id, version: value.version }),
      'SIGNOFF_VERSION_MISMATCH',
    );
  }
  return value;
}

export function validateBinding(value) {
  return checkContract('activation-binding', value, 'BINDING_INVALID');
}
