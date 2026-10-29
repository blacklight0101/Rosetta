import { expect, it } from 'vitest';
import { findCyclesSteps } from '../../../../../src/infrastructure/sources/workbook/dependency-cycles.js';
import { collectSteps } from '../../../../../src/infrastructure/sources/workbook/dependency-collect.js';
import { buildProject } from '../../../../../src/infrastructure/sources/workbook/dependency-project.js';
import { DEFAULT_DEPENDENCY_LIMITS } from '../../../../../src/infrastructure/sources/workbook/dependency-limits.js';
import { drive } from '../../../../../src/infrastructure/sources/workbook/render-steps.js';
import { chainProject } from '../../../../support/dependency-fixtures.js';

// RF-159, RNF-017: the circular-reference search hands the server back after a number of roots.

const countYields = (rootsPerTurn: number | undefined): number => {
  const project = buildProject(chainProject(10, '1'), []);
  const collected = drive(collectSteps(project, DEFAULT_DEPENDENCY_LIMITS));
  const limits =
    rootsPerTurn === undefined
      ? DEFAULT_DEPENDENCY_LIMITS
      : { ...DEFAULT_DEPENDENCY_LIMITS, rootsPerTurn };
  const steps = findCyclesSteps(project, collected.store, collected.nodeSheet.length, limits);
  let yields = 0;
  for (;;) {
    const next = steps.next();
    if (next.done === true) return yields;
    yields += 1;
  }
};

it('RF-159 hands the server back after every set number of roots of the cycle search', () => {
  expect(countYields(3)).toBe(3);
  expect(countYields(1)).toBe(10);
});

it('RF-159 hands the server back every 4096 roots unless told otherwise', () => {
  expect(countYields(undefined)).toBe(0);
});
