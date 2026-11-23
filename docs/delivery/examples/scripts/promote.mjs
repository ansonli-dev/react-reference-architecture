import {
  DeliveryError,
  fingerprint,
  itemsHash,
  requireThat,
  same,
  validateCandidate,
  validateSignoff,
} from './contracts.mjs';
import { checkExecution } from './guard.mjs';
import { planLockTransition, replaceLock, requireIntent } from './lock.mjs';

const plans = new WeakMap();

function requireRules(rules, environment) {
  requireThat(
    rules?.approved_digest &&
      rules.approved_digest === rules.effective_digest &&
      Number.isSafeInteger(rules.writer_app_id) &&
      rules.writer_app_id > 0 &&
      same(rules.writers, [rules.writer_app_id]) &&
      same(rules.quality_bypass, []) &&
      rules.admins_excluded === true &&
      rules.all_writers_use_lock === true &&
      (environment === 'test' || rules.source_frozen === true),
    'TARGET_GUARD_UNAVAILABLE',
  );
}

export function validatePromotion(candidate, signoff, state, now) {
  validateCandidate(candidate);
  const { environment, refs, review, tree, rules } = state;
  const prod = environment === 'prod';
  requireThat(
    prod
      ? candidate.stage === 'qa_ready'
      : environment === 'test' && candidate.stage === 'built',
    'PROMOTION_STAGE',
  );
  requireRules(rules, environment);
  const source = prod ? candidate.test_sha : candidate.source_sha;
  const target = prod
    ? candidate.expected_prod_sha
    : candidate.expected_test_base_sha;
  const artifactTree = prod ? candidate.test_tree : candidate.source_tree;
  requireThat(refs?.source === source, 'SOURCE_CHANGED');
  requireThat(refs.target === target, 'TARGET_CHANGED');
  requireThat(
    tree?.source === source &&
      tree.target === target &&
      tree.tree === artifactTree,
    'MERGE_TREE_CHANGED',
  );
  requireThat(
    review?.head === source &&
      review.checks_head === source &&
      review.checks_passed === true &&
      review.repository === candidate.repository &&
      review.base_ref === environment &&
      review.head_ref === (prod ? 'test' : 'develop') &&
      Number.isSafeInteger(review.pr_number) &&
      review.pr_number > 0 &&
      review.approver !== review.author &&
      review.authorized_approvers?.includes(review.approver),
    'REVIEW_UNVERIFIED',
  );
  requireThat(
    state.inventory_hash === itemsHash(candidate.items),
    'SCOPE_MISMATCH',
  );
  if (prod) {
    requireThat(
      signoff &&
        same(state.signoff, signoff) &&
        state.authorized_qa?.includes(signoff.principal),
      'QA_AUTHORITY_UNVERIFIED',
    );
    validateSignoff(signoff, candidate, now);
    requireThat(
      same(state.test_evidence, candidate.test_deployment),
      'TEST_DEPLOYMENT_MISMATCH',
    );
  } else {
    requireThat(
      same(state.develop_evidence, {
        sha: source,
        tree: artifactTree,
        manifest_digest: candidate.manifest_digest,
        run_id: candidate.build_run_id,
        run_attempt: candidate.build_run_attempt,
        self_tested: true,
      }),
      'DEVELOP_SELF_TEST_UNVERIFIED',
    );
  }
  const plan = {
    environment,
    source,
    target,
    artifact_tree: artifactTree,
    pr_number: review.pr_number,
    manifest_digest: candidate.manifest_digest,
    rules_digest: rules.approved_digest,
  };
  plans.set(plan, structuredClone({ plan, candidate, signoff }));
  return plan;
}

function mergeCandidate(candidate, plan, commit) {
  return validateCandidate(
    plan.environment === 'prod'
      ? {
          ...candidate,
          stage: 'promoted',
          prod_merge_sha: commit.sha,
          prod_merge_tree: commit.tree,
          prod_merge: { parents: commit.parents },
        }
      : {
          ...candidate,
          stage: 'test_merged',
          test_sha: commit.sha,
          test_tree: commit.tree,
          test_merge: {
            parents: commit.parents,
            artifact_tree: plan.artifact_tree,
          },
        },
  );
}

export async function executePromotion(plan, deps) {
  const approved = plans.get(plan);
  const result = {
    outcome: 'blocked',
    code: null,
    merged: false,
    deployed: false,
    merge_sha: null,
    merge_tree: null,
    generation: null,
  };
  try {
    requireThat(approved && same(plan, approved.plan), 'INVALID_PLAN');
    const activation = await checkExecution(deps?.gate, deps);
    requireThat(
      activation.operation === 'promote' &&
        activation.environment === plan.environment,
      'INVALID_PLAN',
    );
    const { candidate, signoff } = approved;
    const prod = plan.environment === 'prod';
    const now = () => deps.now?.() ?? Date.now();
    const revalidate = async () => {
      const latest = validatePromotion(
        candidate,
        signoff,
        await deps.readTrustedState(),
        now(),
      );
      requireThat(same(plan, latest), 'PROMOTION_PLAN_CHANGED');
    };
    await revalidate();
    let lock = await deps.readLock();
    let proof = await deps.readControl();
    requireThat(
      activation.test_namespace_uid &&
        lock?.namespace_uid === activation.test_namespace_uid,
      'NAMESPACE_UID_MISMATCH',
    );
    const actor = proof.actor;

    const cas = async (request, evidence = proof) => {
      const replacement = planLockTransition(
        lock,
        { actor, generation: lock.generation, ...request },
        evidence,
        now(),
      );
      lock = (await replaceLock(replacement, deps)).lock;
      result.generation = lock.generation;
    };
    await cas(
      prod
        ? { kind: 'handoff', candidate, grant_id: proof.grant?.id }
        : { kind: 'acquire', candidate },
    );
    const makeIntent = (kind, sha, digest, actor_job) => ({
      id: [actor.run_id, actor.run_attempt, lock.generation, kind].join('/'),
      kind,
      target: plan.environment,
      actor_job,
      status: 'in_flight',
      sha,
      digest,
      result: null,
    });
    const finish = async (status, receipt) =>
      cas(
        { kind: 'complete_intent' },
        {
          ...proof,
          operation_result: { ...lock.operation, status, result: receipt },
        },
      );
    await cas({
      kind: 'record_intent',
      operation: makeIntent('merge', plan.source, null, 'coordinator'),
    });
    await revalidate();
    proof = await deps.readControl();
    requireThat(
      same(proof.actor, actor) &&
        proof.workflow_allowed === true &&
        (!prod ||
          (proof.grant &&
            fingerprint(proof.grant) === lock.grant.digest &&
            Date.parse(proof.grant.expires_at) > now())),
      'HANDOFF_AUTHORITY_UNVERIFIED',
    );
    requireIntent(await deps.readLock(), lock);

    // The provider protects head; effective writer exclusion and the intent protect the target.
    result.merged = null;
    const merge = await deps.mergePullRequest({
      number: plan.pr_number,
      sha: plan.source,
      merge_method: 'merge',
    });
    requireThat(typeof merge?.merged === 'boolean', 'MERGE_RESULT_UNKNOWN');
    result.merged = merge.merged;
    if (!merge.merged) {
      await finish('failed', {
        sha: plan.source,
        tree: null,
        digest: null,
        evidence_id: 'provider-rejected-merge',
      });
      throw new DeliveryError('MERGE_REJECTED');
    }
    result.merge_sha = /^[a-f0-9]{40}$/.test(merge.sha) ? merge.sha : null;
    const commit = await deps.readCommit(merge.sha);
    requireThat(
      commit?.sha === result.merge_sha &&
        result.merge_sha &&
        same(commit.parents, [plan.target, plan.source]) &&
        commit.tree === plan.artifact_tree,
      'MERGE_RESULT_MISMATCH',
    );
    result.merge_tree = commit.tree;
    requireThat(
      same(await deps.readRefs(), { source: plan.source, target: commit.sha }),
      'POST_MERGE_REF_CHANGED',
    );
    const release = mergeCandidate(candidate, plan, commit);
    await finish('succeeded', {
      sha: commit.sha,
      tree: commit.tree,
      digest: null,
      evidence_id: fingerprint(commit),
    });

    // Re-read the guards before handing the deployment intent to the separate writer.
    const latest = await deps.readTrustedState();
    requireRules(latest.rules, plan.environment);
    requireThat(
      latest.rules.approved_digest === plan.rules_digest,
      'TARGET_GUARD_UNAVAILABLE',
    );
    if (prod) {
      requireThat(
        same(latest.signoff, signoff) &&
          latest.authorized_qa?.includes(signoff.principal),
        'QA_AUTHORITY_UNVERIFIED',
      );
      validateSignoff(signoff, candidate, now());
    }
    await cas({
      kind: 'record_intent',
      operation: makeIntent(
        'deploy',
        commit.sha,
        candidate.manifest_digest,
        plan.environment + '-deployer',
      ),
    });
    requireThat(
      same(await deps.readRefs(), { source: plan.source, target: commit.sha }),
      'POST_MERGE_REF_CHANGED',
    );
    requireIntent(await deps.readLock(), lock);
    result.deployed = null;
    const deployed = await deps.deploy(release, structuredClone(lock));
    const versions = deployed?.evidence;
    requireThat(
      deployed?.outcome === 'verified' &&
        versions?.sha === commit.sha &&
        versions.namespace === activation.namespace &&
        versions.manifest_digest === candidate.manifest_digest &&
        same(
          versions.config_refs,
          candidate.config_refs_by_environment[plan.environment],
        ),
      'DEPLOYMENT_NOT_VERIFIED',
    );
    result.deployed = true;
    const evidence_id = fingerprint(versions);
    await finish('succeeded', {
      sha: commit.sha,
      tree: commit.tree,
      digest: versions.manifest_digest,
      evidence_id,
    });
    const finalCandidate = prod
      ? release
      : {
          ...release,
          stage: 'test_deployed',
          test_deployment: {
            run_id: actor.run_id,
            run_attempt: actor.run_attempt,
            observed_digest: versions.manifest_digest,
            config_refs: versions.config_refs,
            evidence_id,
          },
        };
    await cas({
      kind: prod ? 'finish_prod' : 'finish_test',
      candidate: finalCandidate,
    });
    return {
      ...result,
      outcome: 'verified',
      code: 'PROMOTION_VERIFIED',
      candidate: finalCandidate,
    };
  } catch (error) {
    return {
      ...result,
      code:
        error instanceof DeliveryError
          ? error.code
          : 'EXTERNAL_RESULT_UNVERIFIED',
    };
  }
}
