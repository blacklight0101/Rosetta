import { describe, expect, it } from 'vitest';
import type { AreaCoverage } from '../../../../src/domain/cards/area-coverage.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { writeCoverageOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { cardLogger, cardTarget, fileOf } from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// RF-260, RF-263, RF-230: the coverage of an area says how many of its flows are incomplete, a
// flow with a step whose citation is invalid or rejected.

const base = {
  files: [{ path: 'src/Orders/Checkout.aspx', read: [{ startLine: 1, endLine: 4 }] }],
  tokens: 100,
  readTokens: 100,
  readTokenShare: 1,
};

function orders(incompleteFlows?: number): AreaCoverage {
  const surface = { flowsMarked: true, screensMarked: true, flowCards: 3, screenCards: 1 };
  return {
    ...base,
    area: 'Orders',
    surface: incompleteFlows === undefined ? surface : { ...surface, incompleteFlows },
  };
}

async function written(coverage: AreaCoverage) {
  const writer = new MemoryOutputWriter();
  const result = await writeCoverageOutputs(writer, cardTarget, {
    coverage: [coverage],
    masker: new SecretMasker(),
    logger: cardLogger(),
  });
  expect(result.ok).toBe(true);
  return writer;
}

describe('coverage of incomplete flows', () => {
  it('RF-260 coverage.md names the incomplete flows of an area next to its flow cards', async () => {
    const markdown = fileOf(await written(orders(2)), 'coverage.md');

    expect(markdown).toContain('- Orders: 3 flow cards (2 incomplete); 1 screen card');
  });

  it('RF-260 coverage.json holds the count', async () => {
    const json: unknown = JSON.parse(fileOf(await written(orders(1)), 'coverage.json'));

    expect(json).toMatchObject({ areas: [{ surface: { flowCards: 3, incompleteFlows: 1 } }] });
  });

  it('RF-260 an area whose flows are all complete says nothing about it', async () => {
    const markdown = fileOf(await written(orders(0)), 'coverage.md');

    expect(markdown).toContain('- Orders: 3 flow cards; 1 screen card');
    expect(markdown).not.toContain('incomplete');
  });

  it('RF-260 coverage from before the count existed is written as before', async () => {
    const writer = await written(orders());

    expect(fileOf(writer, 'coverage.md')).toContain('- Orders: 3 flow cards; 1 screen card');
    expect(fileOf(writer, 'coverage.json')).not.toContain('incompleteFlows');
  });
});
