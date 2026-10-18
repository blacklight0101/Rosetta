import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCard } from '../../../../src/domain/cards/card.js';
import { renderCardFile } from '../../../../src/infrastructure/cards/card-markdown.js';
import { FileReportCards } from '../../../../src/infrastructure/cards/file-report-cards.js';
import { NodeRunFileReader } from '../../../../src/infrastructure/files/node-run-file-reader.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-502: the card files of a run, read from a real data folder through the bounded run file reader.

const data = useTempRoot('rosetta-report-cards-');
const scope = scopeFor('20261012-100000-understand');

describe('FileReportCards over a data folder', () => {
  it('RF-502 reads the card file a run wrote and nothing outside the run folder', async () => {
    const created = createCard({
      id: 'BR-001',
      type: 'BR',
      title: 'Free shipping',
      summary: 'Over 50.',
      area: 'orders',
      agentTaskId: 'task-orders',
      confidence: 'High',
      claims: [{ text: 'x', citations: [{ path: 'a.cs', startLine: 1, endLine: 2 }] }],
    });
    if (!created.ok) throw new Error('the card does not build');
    const folder = join(data.path, 'users', scope.userId, 'projects', scope.projectId);
    await mkdir(join(folder, 'runs', scope.runKey, 'cards', 'BR'), { recursive: true });
    const file = renderCardFile(created.value, cardSource, new SecretMasker(), []);
    await writeFile(join(folder, 'runs', scope.runKey, 'cards', 'BR', 'BR-001.md'), file);
    await writeFile(join(folder, 'secret.md'), file);
    const cards = new FileReportCards(new NodeRunFileReader(data.path));

    const read = await cards.read(scope, ['cards/BR/BR-001.md', '../../secret.md']);

    expect(read.map((card) => card.id)).toEqual(['BR-001']);
  });
});
