import { describe, expect, it } from 'vitest';
import type { ObjectCoverage } from '../../../../src/domain/cards/database-objects.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { writeCoverageOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { cardLogger, cardTarget, fileOf } from '../../../support/card-output-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';

// P5-36, RF-230: coverage.md lists each database object with the card that states what it does,
// "named only" or "no card"; coverage.json holds the same. Names are escaped as text (RF-507).

const at = { path: 'db/a.sql' };
const objects: readonly ObjectCoverage[] = [
  {
    ...at,
    kind: 'procedure',
    name: 'CloseVisit',
    startLine: 18,
    endLine: 23,
    state: 'card',
    cards: ['BR-001'],
  },
  {
    ...at,
    kind: 'view',
    name: 'TopVisits',
    startLine: 14,
    endLine: 16,
    state: 'named-only',
    cards: [],
  },
  {
    ...at,
    kind: 'table',
    name: '<b>Evil</b>',
    startLine: 1,
    endLine: 9,
    state: 'no-card',
    cards: [],
  },
];

async function written(list: readonly ObjectCoverage[] | undefined) {
  const writer = new MemoryOutputWriter();
  const result = await writeCoverageOutputs(writer, cardTarget, {
    coverage: [],
    ...(list === undefined ? {} : { objects: list }),
    masker: new SecretMasker(),
    logger: cardLogger(),
  });
  expect(result.ok).toBe(true);
  return writer;
}

describe('coverage of database objects', () => {
  it('P5-36 coverage.md lists each object with its card, "named only" or "no card"', async () => {
    const md = fileOf(await written(objects), 'coverage.md');

    expect(md).toContain('## Database objects');
    expect(md).toMatch(/CloseVisit.*procedure.*db\/a\.sql:18-23.*BR-001/u);
    expect(md).toMatch(/TopVisits.*named only/u);
    expect(md).toMatch(/Evil.*no card/u);
    expect(md).not.toContain('<b>Evil</b>');
  });

  it('P5-36 coverage.json holds the objects', async () => {
    const json = JSON.parse(fileOf(await written(objects), 'coverage.json')) as {
      databaseObjects: { name: string; state: string; cards: string[] }[];
    };

    expect(json.databaseObjects.map((o) => [o.name, o.state])).toEqual([
      ['CloseVisit', 'card'],
      ['TopVisits', 'named-only'],
      ['<b>Evil</b>', 'no-card'],
    ]);
  });

  it('P5-36 a run without objects is written as before', async () => {
    const writer = await written(undefined);

    expect(fileOf(writer, 'coverage.md')).not.toContain('Database objects');
    expect(fileOf(writer, 'coverage.json')).not.toContain('databaseObjects');
  });
});
