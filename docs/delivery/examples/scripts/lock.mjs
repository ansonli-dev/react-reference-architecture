import {
  checkContract,
  DeliveryError,
  fingerprint,
  itemsHash,
  requireCurrent,
  requireThat,
  same,
  validateCandidate,
  validateSignoff,
} from './contracts.mjs';

const name = 'bookstore-delivery-state';
const namespace = 'rra-test';
const replacements = new WeakMap();

export function candidateSubject(candidate) {
  const built = { ...validateCandidate(candidate) };
  const test = {};
  for (const key of [
    'test_sha',
    'test_tree',
    'test_merge',
    'test_deployment',
  ]) {
    test[key] = built[key];
    delete built[key];
  }
  for (const key of [
    'stage',
    'qa_signoff',
    'prod_merge_sha',
    'prod_merge_tree',
    'prod_merge',
    'items',
  ]) {
    delete built[key];
  }
  return {
    candidate_id: candidate.candidate_id,
    revision: candidate.revision,
    built_digest: fingerprint({
      ...built,
      items_hash: itemsHash(candidate.items),
    }),
    test_digest: test.test_deployment ? fingerprint(test) : null,
    test_sha: test.test_sha ?? null,
    bootstrap_id: null,
    bootstrap_sha: null,
  };
}

function assertCandidate(lock, candidate) {
  const subject = candidateSubject(candidate);
  requireThat(
    lock.subject?.built_digest === subject.built_digest &&
      (!lock.subject.test_digest ||
        lock.subject.test_digest === subject.test_digest),
    'LOCK_CANDIDATE_MISMATCH',
  );
  return subject;
}

function predecessorEnded(lock, evidence) {
  const info = evidence.predecessor;
  return (
    info?.terminal === true &&
    same(info.holder, lock.holder) &&
    info.latest_attempt === lock.holder?.run_attempt
  );
}

function priorResult(lock, result) {
  const operation = lock.operation;
  requireThat(
    result &&
      operation &&
      result.status !== 'in_flight' &&
      result.result &&
      same({ ...result, status: 'in_flight', result: null }, operation),
    'OPERATION_RESULT_UNVERIFIED',
  );
  return result;
}

function verifyFinalApproval(lock, candidate, grant, evidence, now) {
  const finalQa = evidence.final_qa;
  const abandoning =
    lock.phase === 'recovery_required' &&
    evidence.release_after_failure === true;
  const deploy = lock.results.find(
    (op) =>
      op.kind === 'deploy' &&
      op.target === 'prod' &&
      op.status === 'succeeded' &&
      op.result.sha === candidate.prod_merge_sha &&
      op.result.digest === candidate.manifest_digest,
  );
  requireThat(
    finalQa &&
      fingerprint(finalQa) === grant.signoff_digest &&
      finalQa.candidate_id === candidate.candidate_id &&
      finalQa.revision === candidate.revision &&
      finalQa.prod_sha === (candidate.prod_merge_sha ?? null) &&
      finalQa.manifest_digest === candidate.manifest_digest &&
      same(finalQa.config_refs, candidate.config_refs_by_environment.prod) &&
      (abandoning
        ? finalQa.conclusion === 'abandoned'
        : deploy && finalQa.conclusion === 'passed'),
    'HANDOFF_AUTHORITY_UNVERIFIED',
  );
  requireCurrent(finalQa, now, 'HANDOFF_AUTHORITY_UNVERIFIED');
}

function transfer(lock, request, evidence, now) {
  const { kind, actor, grant_id, candidate } = request;
  requireThat(
    !same(actor, lock.holder) &&
      predecessorEnded(lock, evidence) &&
      evidence.predecessor.writes_quiescent === true &&
      (!lock.operation || kind === 'recover'),
    'PREDECESSOR_NOT_QUIESCENT',
  );
  const grant = checkContract(
    'handoff-grant',
    evidence.grant,
    'HANDOFF_AUTHORITY_UNVERIFIED',
  );
  requireCurrent(grant, now, 'HANDOFF_AUTHORITY_UNVERIFIED');
  requireThat(
    grant.kind === kind &&
      grant.id === grant_id &&
      grant.lock_uid === lock.uid &&
      grant.namespace_uid === lock.namespace_uid &&
      grant.expected_generation === lock.generation &&
      grant.subject_digest === fingerprint(lock.subject) &&
      same(grant.predecessor, lock.holder) &&
      same(grant.successor, actor),
    'HANDOFF_AUTHORITY_UNVERIFIED',
  );

  let phase;
  let results = lock.results;
  let subject = lock.subject;
  if (kind === 'handoff') {
    requireThat(
      lock.phase === 'qa_window' &&
        evidence.predecessor.conclusion === 'success',
      'LOCK_PHASE_MISMATCH',
    );
    assertCandidate(lock, candidate);
    const signoff = validateSignoff(evidence.signoff, candidate, now);
    requireThat(
      fingerprint(signoff) === grant.signoff_digest,
      'HANDOFF_AUTHORITY_UNVERIFIED',
    );
    phase = 'prod_active';
  } else if (kind === 'finalize') {
    requireThat(
      (lock.phase === 'prod_qa_window' &&
        evidence.predecessor.conclusion === 'success') ||
        (lock.phase === 'recovery_required' &&
          evidence.release_after_failure === true),
      'LOCK_PHASE_MISMATCH',
    );
    assertCandidate(lock, candidate);
    verifyFinalApproval(lock, candidate, grant, evidence, now);
    phase = 'finalizing';
  } else {
    requireThat(lock.phase === 'recovery_required', 'LOCK_PHASE_MISMATCH');
    if (lock.operation) {
      requireThat(evidence.reconciled, 'PREDECESSOR_NOT_QUIESCENT');
      results = [...results, priorResult(lock, evidence.reconciled)];
    }
    phase = evidence.recovery_phase;
    requireThat(
      phase ===
        {
          bootstrap_active: 'bootstrap_active',
          test_active: 'test_active',
          qa_window: 'test_active',
          prod_active: 'prod_active',
          prod_qa_window: 'prod_active',
          finalizing: 'finalizing',
        }[lock.recovery_from],
      'LOCK_PHASE_MISMATCH',
    );
    if (lock.subject.bootstrap_id) {
      requireThat(
        phase === 'bootstrap_active' &&
          evidence.bootstrap_sha === lock.subject.bootstrap_sha &&
          evidence.bootstrap_id === lock.subject.bootstrap_id,
        'BOOTSTRAP_AUTHORITY_UNVERIFIED',
      );
    } else {
      assertCandidate(lock, candidate);
      requireThat(
        ['test_active', 'prod_active', 'finalizing'].includes(phase),
        'LOCK_PHASE_MISMATCH',
      );
      if (phase === 'finalizing') {
        verifyFinalApproval(lock, candidate, grant, evidence, now);
      }
      if (phase === 'test_active') {
        subject = { ...subject, test_digest: null, test_sha: null };
        results = results.filter(
          (op) => op.kind === 'merge' && op.target === 'test',
        );
      }
    }
  }
  return {
    ...lock,
    phase,
    holder: actor,
    subject,
    generation: lock.generation + 1,
    operation: null,
    results,
    recovery_from: null,
    grant: {
      id: grant.id,
      kind: grant.kind,
      digest: fingerprint(grant),
      predecessor: lock.holder,
    },
  };
}

function successfulMerge(lock, target) {
  return lock.results.find(
    (op) =>
      op.kind === 'merge' && op.target === target && op.status === 'succeeded',
  );
}

export function requireDeploymentMerge(lock, operation, candidate) {
  assertCandidate(lock, candidate);
  const prod = operation.target === 'prod';
  const merge = successfulMerge(lock, operation.target);
  const sha = prod ? candidate.prod_merge_sha : candidate.test_sha;
  const tree = prod ? candidate.prod_merge_tree : candidate.test_tree;
  requireThat(
    sha &&
      tree &&
      operation.sha === sha &&
      operation.digest === candidate.manifest_digest &&
      merge?.sha === (prod ? candidate.test_sha : candidate.source_sha) &&
      merge.result?.sha === sha &&
      merge.result.tree === tree,
    'MERGE_RECEIPT_MISMATCH',
  );
}

export function recoveryIntentDigest(lock, operation) {
  return fingerprint({
    lock_uid: lock.uid,
    namespace_uid: lock.namespace_uid,
    generation: lock.generation,
    holder: lock.holder,
    subject: lock.subject,
    grant: lock.grant,
    operation,
    merge: successfulMerge(lock, operation.target)?.result ?? null,
  });
}

export function requireRecoveryApproval(lock, operation, approval, now) {
  if (lock.grant?.kind !== 'recover') return;
  requireThat(
    approval?.intent_digest === recoveryIntentDigest(lock, operation),
    'RECOVERY_APPROVAL_UNVERIFIED',
  );
  requireCurrent(approval, now, 'RECOVERY_APPROVAL_UNVERIFIED');
}

export function requireCurrentGrant(lock, grant, now) {
  requireThat(
    lock.grant &&
      grant &&
      grant.id === lock.grant.id &&
      grant.kind === lock.grant.kind &&
      grant.lock_uid === lock.uid &&
      grant.namespace_uid === lock.namespace_uid &&
      grant.expected_generation + 1 === lock.generation &&
      same(grant.successor, lock.holder) &&
      fingerprint(grant) === lock.grant.digest,
    'HANDOFF_AUTHORITY_UNVERIFIED',
  );
  requireCurrent(grant, now, 'HANDOFF_AUTHORITY_UNVERIFIED');
}

function stageIntent(lock, operation, candidate, evidence, now) {
  requireThat(!lock.operation, 'OPERATION_IN_FLIGHT');
  const target = { test_active: 'test', prod_active: 'prod' }[lock.phase];
  const bootstrap = lock.phase === 'bootstrap_active';
  requireThat(
    operation?.status === 'in_flight' &&
      operation.result === null &&
      (bootstrap
        ? operation.kind === 'bootstrap_ref' &&
          operation.sha === lock.subject.bootstrap_sha
        : target &&
          operation.target === target &&
          operation.kind !== 'bootstrap_ref'),
    'LOCK_PHASE_MISMATCH',
  );
  const allowedJob = ['merge', 'bootstrap_ref'].includes(operation.kind)
    ? 'coordinator'
    : operation.target + '-deployer';
  requireThat(
    operation.actor_job === allowedJob,
    'LOCK_ACTOR_JOB_UNAUTHORIZED',
  );
  requireThat(
    !lock.results.some(
      (prior) =>
        prior.id === operation.id ||
        (prior.target === operation.target &&
          prior.kind === operation.kind &&
          ['merge', 'bootstrap_ref'].includes(prior.kind) &&
          prior.status === 'succeeded'),
    ),
    'OPERATION_ALREADY_APPLIED',
  );
  if (operation.kind === 'deploy')
    requireDeploymentMerge(lock, operation, candidate);
  requireRecoveryApproval(lock, operation, evidence.recovery_approval, now);
  return { ...lock, operation };
}

function finishDeployment(lock, candidate, environment) {
  requireThat(
    !lock.operation && lock.phase === environment + '_active',
    'LOCK_PHASE_MISMATCH',
  );
  const subject = assertCandidate(lock, candidate);
  const sha =
    environment === 'test' ? candidate.test_sha : candidate.prod_merge_sha;
  const operations = lock.results.filter(
    (op) => op.target === environment && op.status === 'succeeded',
  );
  const merge = operations.find(
    (op) =>
      op.kind === 'merge' &&
      op.result.sha === sha &&
      op.result.tree ===
        (environment === 'prod'
          ? candidate.prod_merge_tree
          : candidate.test_tree),
  );
  const deploy = operations.find(
    (op) =>
      op.kind === 'deploy' &&
      op.result.sha === sha &&
      op.result.digest === candidate.manifest_digest &&
      (environment !== 'test' ||
        op.result.evidence_id === candidate.test_deployment?.evidence_id),
  );
  requireThat(
    subject.test_digest &&
      sha &&
      merge &&
      deploy &&
      (environment === 'prod' ||
        (candidate.test_deployment.run_id === lock.holder.run_id &&
          candidate.test_deployment.run_attempt === lock.holder.run_attempt)),
    'DEPLOYMENT_NOT_VERIFIED',
  );
  return {
    ...lock,
    subject,
    phase: environment === 'test' ? 'qa_window' : 'prod_qa_window',
  };
}

function transition(lock, request, evidence, now) {
  const { kind, actor, generation, candidate } = request;
  if (kind === 'acquire' || kind === 'bootstrap') {
    requireThat(
      lock.phase === 'available' && !lock.holder && !lock.operation,
      'LOCK_OCCUPIED',
    );
    let subject;
    if (kind === 'acquire') {
      requireThat(
        candidate?.stage === 'built' &&
          evidence.approved_candidate === fingerprint(candidate),
        'CANDIDATE_NOT_APPROVED',
      );
      subject = candidateSubject(candidate);
    } else {
      const approved = evidence.bootstrap;
      requireThat(
        approved?.authorized === true &&
          typeof request.bootstrap_id === 'string' &&
          approved.id === request.bootstrap_id &&
          approved.base_sha === request.bootstrap_sha &&
          same(approved.absent_refs, ['test', 'prod']),
        'BOOTSTRAP_AUTHORITY_UNVERIFIED',
      );
      subject = {
        candidate_id: null,
        revision: null,
        built_digest: fingerprint(approved),
        test_sha: null,
        test_digest: null,
        bootstrap_id: approved.id,
        bootstrap_sha: approved.base_sha,
      };
    }
    return {
      ...lock,
      phase: kind === 'acquire' ? 'test_active' : 'bootstrap_active',
      subject,
      holder: actor,
      generation: lock.generation + 1,
      grant: null,
      results: [],
    };
  }
  if (['handoff', 'recover', 'finalize'].includes(kind))
    return transfer(lock, request, evidence, now);
  if (kind === 'mark_recovery') {
    requireThat(
      lock.holder &&
        predecessorEnded(lock, evidence) &&
        (lock.operation || evidence.predecessor.conclusion !== 'success'),
      'PREDECESSOR_NOT_QUIESCENT',
    );
    return {
      ...lock,
      phase: 'recovery_required',
      recovery_from: lock.recovery_from ?? lock.phase,
    };
  }
  requireThat(
    same(actor, lock.holder) && generation === lock.generation,
    'LOCK_HOLDER_MISMATCH',
  );
  switch (kind) {
    case 'record_intent':
      return stageIntent(lock, request.operation, candidate, evidence, now);
    case 'complete_intent': {
      requireThat(lock.phase !== 'recovery_required', 'LOCK_PHASE_MISMATCH');
      const result = priorResult(lock, evidence.operation_result);
      return {
        ...lock,
        operation: null,
        results: [...lock.results, result],
        phase: result.status === 'succeeded' ? lock.phase : 'recovery_required',
        recovery_from: result.status === 'succeeded' ? null : lock.phase,
      };
    }
    case 'finish_test':
      return finishDeployment(lock, candidate, 'test');
    case 'finish_prod':
      return finishDeployment(lock, candidate, 'prod');
    case 'release': {
      requireThat(
        !lock.operation &&
          ['finalizing', 'bootstrap_active'].includes(lock.phase),
        'LOCK_PHASE_MISMATCH',
      );
      const completed =
        lock.phase === 'finalizing' ||
        ['test', 'prod'].every((target) =>
          lock.results.some(
            (op) =>
              op.target === target &&
              op.kind === 'bootstrap_ref' &&
              op.status === 'succeeded' &&
              op.result.sha === lock.subject.bootstrap_sha,
          ),
        );
      requireThat(
        completed && evidence.archive_digest === fingerprint(lock),
        'RELEASE_NOT_VERIFIED',
      );
      return {
        ...lock,
        phase: 'available',
        holder: null,
        subject: null,
        operation: null,
        grant: null,
      };
    }
    default:
      throw new DeliveryError('UNKNOWN_LOCK_TRANSITION');
  }
}

export function requireCoordinator(actor, evidence) {
  checkContract('run-holder', actor, 'LOCK_WRITER_UNAUTHORIZED');
  requireThat(
    evidence?.principal === 'rra-test-coordinator' &&
      evidence.job === 'coordinator' &&
      evidence.latest_attempt === actor.run_attempt &&
      evidence.workflow_allowed === true &&
      same(actor, evidence.actor),
    'LOCK_WRITER_UNAUTHORIZED',
  );
}

export function planLockTransition(observed, request, trustedEvidence, now) {
  checkContract('lock', observed, 'LOCK_INVALID');
  requireThat(
    (observed.phase === 'available') === (observed.holder === null) &&
      (observed.phase === 'available') === (observed.subject === null) &&
      (observed.phase === 'recovery_required') ===
        (observed.recovery_from !== null),
    'LOCK_INVALID',
  );
  requireCoordinator(request.actor, trustedEvidence);
  const replacement = checkContract(
    'lock',
    transition(observed, request, trustedEvidence, now),
    'LOCK_INVALID',
  );
  replacements.set(replacement, {
    snapshot: structuredClone(replacement),
    now,
    transfer: ['handoff', 'recover', 'finalize'].includes(request.kind),
  });
  return replacement;
}

export function requireIntent(
  lock,
  { holder, generation, operation, subject, uid, namespace_uid },
) {
  requireThat(
    lock?.phase === operation.target + '_active' &&
      lock.uid === uid &&
      lock.namespace_uid === namespace_uid &&
      lock.generation === generation &&
      same(lock.holder, holder) &&
      same(lock.subject, subject) &&
      same(lock.operation, operation),
    'LOCK_INTENT_MISMATCH',
  );
}

export async function replaceLock(replacement, deps) {
  const entry = replacements.get(replacement);
  requireThat(
    entry && same(entry.snapshot, replacement),
    'INVALID_REPLACEMENT',
  );
  const { resource_version, uid, ...state } = replacement;
  // The transport must report HTTP 409 distinctly and preserve this resourceVersion.
  const body = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name, namespace, uid, resourceVersion: resource_version },
    data: { state: JSON.stringify(state) },
  };
  let current;
  try {
    current = await deps.replaceConfigMap(body);
  } catch (error) {
    if (error?.status !== 409) throw new DeliveryError('LOCK_WRITE_UNKNOWN');
    requireThat(entry.transfer, 'LOCK_CONFLICT');
    const observed = await deps.readLock();
    const grant =
      replacement.grant &&
      (await deps.readCurrentGrant?.(replacement.grant.id));
    requireThat(
      grant &&
        fingerprint(grant) === replacement.grant.digest &&
        observed &&
        same({ ...observed, resource_version }, replacement),
      'LOCK_CONFLICT',
    );
    requireCurrent(grant, deps.now?.() ?? entry.now, 'LOCK_CONFLICT');
    return { outcome: 'already_current', lock: observed };
  }
  requireThat(
    current &&
      same({ ...current, resource_version }, replacement) &&
      typeof current.resource_version === 'string' &&
      current.resource_version &&
      current.resource_version !== resource_version,
    'LOCK_WRITE_UNKNOWN',
  );
  return { outcome: 'replaced', lock: current };
}
