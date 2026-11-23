import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { itemsHash, signedVersions } from '../scripts/contracts.mjs';
import { validatePromotion } from '../scripts/promote.mjs';
import { candidate, digest, now, signoff } from './samples.mjs';

test('two successive forward normal merges preserve head checks and each signed tree', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'rra-forward-merges-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const prefix = [
    '-C',
    directory,
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
  ];
  const git = (args, input) =>
    execFileSync('git', [...prefix, ...args], {
      input,
      encoding: 'utf8',
    }).trim();
  git(['init', '--bare', '--quiet']);
  const tree = (body) => {
    const blob = git(['hash-object', '-w', '--stdin'], body);
    return git(['mktree'], '100644 blob ' + blob + '\tbook.txt\n');
  };
  const commit = (tree, parents) =>
    git(
      ['commit-tree', tree, ...parents.flatMap((p) => ['-p', p])],
      'fixture\n',
    );
  const isAncestor = (base, head) =>
    spawnSync('git', [...prefix, 'merge-base', '--is-ancestor', base, head])
      .status === 0;
  const quality = JSON.parse(
    readFileSync(new URL('../rulesets/quality.json', import.meta.url)),
  );
  const checks = quality.rules.find(
    (rule) => rule.type === 'required_status_checks',
  ).parameters;
  const reviewGate = quality.rules.find(
    (rule) => rule.type === 'pull_request',
  ).parameters;
  assert.ok(
    reviewGate.required_approving_review_count > 0 &&
      reviewGate.require_last_push_approval,
  );
  assert.deepEqual(reviewGate.allowed_merge_methods, ['merge']);
  assert.deepEqual(quality.bypass_actors, []);
  assert.deepEqual(
    checks.required_status_checks.map(({ context }) => context),
    ['checks', 'visual', 'release-image'],
  );
  let develop = commit(tree('start'), []);
  let testHead = develop;
  let prodHead = develop;
  for (const batch of [1, 2]) {
    const artifactTree = tree('batch ' + batch);
    develop = commit(artifactTree, [develop]);
    const built = {
      ...candidate('built'),
      source_sha: develop,
      source_tree: artifactTree,
      expected_test_base_sha: testHead,
      expected_prod_sha: prodHead,
    };
    const run = (env, value, qa, source, target, headRef) => {
      assert.equal(isAncestor(target, source), batch === 1);
      const mergedTree = git(['merge-tree', '--write-tree', target, source]);
      const state = {
        environment: env,
        refs: { source, target },
        tree: { source, target, tree: mergedTree },
        review: {
          head: source,
          checks_head: source,
          checks_passed: true,
          repository: value.repository,
          base_ref: env,
          head_ref: headRef,
          pr_number: batch,
          approver: 'tl',
          author: 'dev',
          authorized_approvers: ['tl'],
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
      const plan = validatePromotion(value, qa, state, now);
      assert.equal(plan.artifact_tree, artifactTree);
      assert.ok(
        !checks.strict_required_status_checks_policy ||
          isAncestor(target, source),
        'approval and head checks must allow forward batch ' +
          batch +
          ' into ' +
          env,
      );
      const merged = commit(mergedTree, [target, source]);
      assert.equal(
        git(['show', '-s', '--format=%P', merged]),
        target + ' ' + source,
      );
      return merged;
    };
    const testParent = testHead;
    testHead = run('test', built, null, develop, testHead, 'develop');
    const fixture = candidate();
    const ready = {
      ...built,
      stage: 'qa_ready',
      test_sha: testHead,
      test_tree: artifactTree,
      test_merge: {
        parents: [testParent, develop],
        artifact_tree: artifactTree,
      },
      test_deployment: fixture.test_deployment,
      qa_signoff: fixture.qa_signoff,
    };
    const qa = { ...signoff(), ...signedVersions(ready) };
    prodHead = run('prod', ready, qa, testHead, prodHead, 'test');
  }
});
