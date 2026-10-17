import { describe, expect, it } from 'vitest';
import type { ConsolidationRecord } from '../../../../src/application/ports/task-results.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FileTaskResults } from '../../../../src/infrastructure/cards/file-task-results.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { openWriter } from '../../../support/open-writer.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-006, RF-250, RF-141, data-model.md section 3.7a, P2-35: `consolidation.json` keeps the card
// types the summariser answered about and the merges it made, so a resume does not pay for them
// again and makes the same merges. Masked like every file Rosetta writes; a file it cannot read
// is an error with a code, never guessed.

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const projectId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e70';
const scope = { id: 'run-1', userId, projectId, runKey: '20261012-100000-understand' };
const file = `projects/${projectId}/runs/${scope.runKey}/consolidation.json`;

const record: ConsolidationRecord = {
  types: [{ type: 'BR', cardIds: ['BR-001', 'BR-002'] }],
  merges: [{ ids: ['BR-001', 'BR-002'], title: 'One rule', summary: 'Both say the same.' }],
};

const LIMITS = { merges: 10_000, mergeIds: 100, cardIds: 100_000 };
const merge = { ids: ['BR-001', 'BR-002'], title: 'T', summary: 'S' };
const ids = (count: number): string[] => Array.from({ length: count }, (_, i) => `BR-${String(i)}`);
const bounded = (parts: object): string =>
  JSON.stringify({ schemaVersion: 1, types: [], merges: [], ...parts });

describe('FileTaskResults, the consolidation record', () => {
  const data = useTempRoot('rosetta-consolidation-record-');

  function open() {
    const writer = openWriter(data.path);
    return { writer, results: new FileTaskResults({ writer, masker: new SecretMasker() }) };
  }

  it('RF-006 P2-35 reads back what it wrote', async () => {
    const { results } = open();

    await results.writeConsolidation(scope, record);

    expect(await results.readConsolidation(scope)).toEqual(record);
  });

  it('RF-006 P2-35 has an empty record for a run that merged nothing', async () => {
    const { results } = open();

    expect(await results.readConsolidation(scope)).toEqual({ types: [], merges: [] });
  });

  it('RF-141 P2-35 masks a secret in the text of a merge before it is stored', async () => {
    const { writer, results } = open();
    const [merge] = record.merges;
    if (merge === undefined) throw new Error('fixture');

    await results.writeConsolidation(scope, {
      ...record,
      merges: [{ ...merge, summary: `key ${fakeOpenAiKey}` }],
    });

    const saved = await writer.readText({ userId, path: file });
    expect(saved.ok && saved.value).not.toContain(fakeOpenAiKey);
    expect(saved.ok && saved.value).toContain('[MASKED:api-key]');
  });
});

describe('FileTaskResults, a consolidation file it cannot read', () => {
  const data = useTempRoot('rosetta-consolidation-bad-');

  function open() {
    const writer = openWriter(data.path);
    return { writer, results: new FileTaskResults({ writer, masker: new SecretMasker() }) };
  }

  it.each([
    ['text that is not JSON', 'not json'],
    ['a newer schema version', JSON.stringify({ schemaVersion: 2, types: [], merges: [] })],
    ['a merge without its title', JSON.stringify({ schemaVersion: 1, types: [], merges: [{}] })],
    [
      'too many merges',
      bounded({ merges: Array.from({ length: LIMITS.merges + 1 }, () => merge) }),
    ],
    ['a merge of too many ids', bounded({ merges: [{ ...merge, ids: ids(LIMITS.mergeIds + 1) }] })],
    [
      'a merge with a title that is too long',
      bounded({ merges: [{ ...merge, title: 'x'.repeat(201) }] }),
    ],
    [
      'a type with too many card ids',
      bounded({ types: [{ type: 'BR', cardIds: ids(LIMITS.cardIds + 1) }] }),
    ],
    [
      'too many types',
      bounded({ types: Array.from({ length: 21 }, () => ({ type: 'BR', cardIds: [] })) }),
    ],
  ])('RF-006 P2-35 refuses a file with %s, with RST-1309', async (_name, text) => {
    const { writer, results } = open();
    await writer.writeText({ userId, path: file }, text);

    await expect(results.readConsolidation(scope)).rejects.toMatchObject({
      code: ERROR_CODES.taskResultsUnreadable,
    });
  });
});
