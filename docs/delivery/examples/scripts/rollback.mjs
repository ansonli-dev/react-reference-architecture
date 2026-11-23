import { requireThat, same, validateCandidate } from './contracts.mjs';
import { prepareDeployment } from './deploy.mjs';

export function planRollback(previousGood, binding, current, options) {
  requireThat(previousGood, 'NO_PREVIOUS_GOOD');
  requireThat(
    previousGood.record_id && same(current.previous_good, previousGood),
    'PREVIOUS_GOOD_CHANGED',
  );
  return prepareDeployment(
    'rollback',
    validateCandidate(options.candidate),
    current,
    { ...options, binding },
    previousGood,
  );
}
