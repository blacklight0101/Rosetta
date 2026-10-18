import { describe, expect, it } from 'vitest';
import {
  apiScope,
  noApiContract,
  servableCards,
} from '../../../../src/domain/planning/api-contract.js';
import { apiCards, briefWithFrontEnd } from '../../../support/api-contract-fixtures.js';

// RF-624, DEC-134: the planner is asked for the API contract only when the brief names a front end
// and the verified cards hold a feature or a flow an operation could serve; otherwise the README
// says why no contract was written and no call is made.

describe('servableCards', () => {
  it('RF-624 keeps the FEAT and FLOW cards, in card order', () => {
    expect(servableCards(apiCards()).map((card) => card.id)).toEqual([
      'FEAT-001',
      'FEAT-002',
      'FLOW-001',
    ]);
  });
});

describe('apiScope', () => {
  it('RF-624 asks when the brief names a front end and a feature or flow is verified', () => {
    expect(apiScope(apiCards(), briefWithFrontEnd('React'))).toEqual({ ask: true });
  });

  it('RF-624 does not ask, and says why, when the brief names no front end', () => {
    const scope = apiScope(apiCards(), briefWithFrontEnd(null));

    expect(scope.ask).toBe(false);
    expect('reason' in scope ? scope.reason : '').toContain('names no front end');
  });

  it('RF-624 does not ask, and says why, when no verified feature or flow exists', () => {
    const entityOnly = apiCards().filter((card) => card.type === 'ENT');

    const scope = apiScope(entityOnly, briefWithFrontEnd('React'));

    expect(scope.ask).toBe(false);
    expect('reason' in scope ? scope.reason : '').toContain('no verified feature or flow');
  });

  it('RF-624 a front end typed as blank spaces counts as none', () => {
    expect(apiScope(apiCards(), briefWithFrontEnd('   ')).ask).toBe(false);
  });
});

describe('noApiContract', () => {
  it('RF-624 is a contract of kind none with the reason', () => {
    expect(noApiContract('Server-rendered.')).toEqual({ kind: 'none', reason: 'Server-rendered.' });
  });
});
