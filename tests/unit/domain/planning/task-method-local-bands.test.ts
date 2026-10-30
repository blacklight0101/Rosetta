import { describe, expect, it } from 'vitest';
import type { BuildMethod } from '../../../../src/domain/planning/build-method.js';
import { localModelCeiling } from '../../../../src/domain/planning/build-method.js';
import { checkCardModel } from '../../../../src/domain/planning/card-model-check.js';
import {
  bandsFor,
  difficultyBands,
  difficultyOfTask,
  tierOfRating,
} from '../../../../src/domain/planning/task-method.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-635, RF-641, DEC-185, P7-12: the bands of a build. A local tier stops at the one ceiling the
// check also uses; the next tier starts right after it; the last tier never stops.

const claude = { aiAssisted: true, agentTool: { kind: 'claude-code' } } as const;
const local = (tiers: NonNullable<BuildMethod['local']>): BuildMethod => ({
  ...claude,
  local: tiers,
});
const rangesOf = (method?: BuildMethod): string[] =>
  bandsFor(method).map((band) => `${String(band.from)}-${String(band.to)} ${band.tier}`);

describe('bandsFor', () => {
  it('RF-635 gives the plain bands with no method, with people building and with no local tier', () => {
    const plain = difficultyBands.map(
      (band) => `${String(band.from)}-${String(band.to)} ${band.tier}`,
    );

    expect(rangesOf()).toEqual(plain);
    expect(rangesOf({ aiAssisted: false })).toEqual(plain);
    expect(rangesOf(claude)).toEqual(plain);
  });

  it('RF-641 a local smallest tier stops at the ceiling and the middle tier starts after it', () => {
    expect(localModelCeiling).toBe(2);
    expect(rangesOf(local({ smallest: true }))).toEqual([
      '1-2 smallest',
      '3-8 middle',
      '9-10 largest',
    ]);
  });

  it('RF-641 a local middle tier takes no card, and the largest tier takes what is above the smallest', () => {
    expect(rangesOf(local({ middle: true }))).toEqual(['1-5 smallest', '6-10 largest']);
  });

  it('RF-641 the largest tier never stops: nothing is above it', () => {
    expect(rangesOf(local({ largest: true }))).toEqual([
      '1-5 smallest',
      '6-8 middle',
      '9-10 largest',
    ]);
    expect(rangesOf(local({ smallest: true, middle: true, largest: true }))).toEqual([
      '1-2 smallest',
      '3-10 largest',
    ]);
  });
});

describe('the tier of a rating on a local build', () => {
  it('RF-641 a rating above the ceiling is never in the local smallest tier', () => {
    const method = local({ smallest: true });

    expect(tierOfRating(2, method)).toBe('smallest');
    expect(tierOfRating(3, method)).toBe('middle');
    expect(tierOfRating(5, method)).toBe('middle');
    expect(tierOfRating(5)).toBe('smallest');
  });

  it('RF-641 difficultyOfTask puts a small card on the middle tier when the smallest tier is local', () => {
    const task = planTask();

    expect(difficultyOfTask(task).tier).toBe('smallest');
    expect(difficultyOfTask(task, local({ smallest: true }))).toMatchObject({
      rating: 4,
      tier: 'middle',
      verifier: 'middle',
    });
  });

  it('RF-641 the check still warns about a local model on a card above the same ceiling', () => {
    const found = checkCardModel(local({ smallest: true }), {
      ...{ cardId: 'T-001', rating: localModelCeiling + 1, riskClass: 'none', riskShown: true },
      ...{ builderTier: 'smallest', builderModel: undefined, verifierTier: 'middle' },
      ...{ verifierModel: undefined, local: true, status: undefined },
    });

    expect(found.map((each) => each.kind)).toContain('local-model');
  });
});
