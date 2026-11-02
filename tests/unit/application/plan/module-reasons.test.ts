import { describe, expect, it } from 'vitest';
import { moduleReasons } from '../../../../src/application/plan/module-reasons.js';
import type { CoverageItem } from '../../../../src/domain/planning/plan-coverage.js';
import { MAX_MODULES } from '../../../../src/domain/planning/source-modules.js';

// P8-06, RF-601: why a module of the source has no task card, from what the plan run did; the
// sentences are Rosetta's and hold no text of the planner's answer.

const desk: CoverageItem = { id: 'module:src/Desk', kind: 'module', name: 'src/Desk', detail: '' };
const left = { position: 2, field: 'phase', reason: 'names a phase that the plan does not have' };

describe('moduleReasons', () => {
  it('RF-601 names the left-out card that built the module, by position and field', () => {
    const rounds = { asked: true, refused: false, problems: [{ ...left, builds: [desk.id] }] };

    expect(moduleReasons([desk], rounds, undefined)).toEqual([
      {
        id: desk.id,
        reason:
          'The card at position 2 of a gap answer named it and was left out: the field "phase" names a phase that the plan does not have.',
      },
    ]);
  });

  it.each([
    [{ asked: false, refused: false }, 'The plan has no phase'],
    [{ asked: true, refused: true }, 'was refused or failed'],
    [{ asked: true, refused: false }, 'The planner wrote no task card for it'],
  ])('RF-601 says why for %o', (state, said) => {
    const [reason] = moduleReasons([desk], { ...state, problems: [] }, undefined);

    expect(reason?.reason).toContain(said);
  });

  it('RF-601 names each module over the cap with the cap', () => {
    const over = { path: 'tools/x', manifests: [], languages: [], files: 1, cards: [] };
    const modules = { modules: [], overCap: [over] };

    const reasons = moduleReasons([], { asked: true, refused: false, problems: [] }, modules);

    expect(reasons).toEqual([
      { id: 'module:tools/x', reason: expect.stringContaining(String(MAX_MODULES)) as string },
    ]);
  });
});
