import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunScope } from '../../../../src/application/ports/run-events.js';
import { readRunClaims, readRunCost } from '../../../../src/infrastructure/eval/run-claims.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { runPath } from '../../../../src/infrastructure/files/workspace-paths.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RNF-006, RNF-012, data-model.md sections 3.7 and 3.12: the evaluation reads the claims of a run
// from the card files `cards/index.json` lists, and the total of `cost.json`. A card it cannot read,
// or an index entry that is not a card file of the run, stops it instead of leaving claims out.

const temp = useTempRoot('rosetta-run-claims-');

const scope: RunScope = {
  id: '00000000-0000-4000-b000-000000000001',
  userId: '00000000-0000-4000-9000-000000000001',
  projectId: '00000000-0000-4000-a000-000000000001',
  runKey: '20261017-093000-understand',
};

const card = [
  '---',
  'schemaVersion: 1',
  'id: "BR-001"',
  'type: "BR"',
  'title: "Price"',
  'claims:',
  '  - claimId: "BR-001.c1"',
  '    text: "The price has two decimals."',
  '    citations:',
  '      - "Models/Item.cs:20-24"',
  '    status: "Supported"',
  '---',
  '',
  '# BR-001 Price',
  '',
].join('\n');

function writer(): NodeOutputWriter {
  const clock = new FixedClock('2026-10-17T09:30:00.000Z');
  return new NodeOutputWriter({
    dataDir: temp.path,
    logger: new MemoryLogger(clock, new SecretMasker()),
  });
}

async function runFile(name: string, text: string): Promise<void> {
  const path = join(
    temp.path,
    'users',
    scope.userId,
    ...runPath(scope.projectId, scope.runKey).split('/'),
    ...name.split('/'),
  );
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, text);
}

describe('the claims of a run', () => {
  it('RNF-006 reads every claim of the listed cards with its card type, title and status', async () => {
    await runFile('cards/index.json', JSON.stringify({ cards: [{ path: 'cards/BR/BR-001.md' }] }));
    await runFile('cards/BR/BR-001.md', card);

    expect(await readRunClaims(writer(), scope)).toEqual([
      {
        claimId: 'BR-001.c1',
        cardType: 'BR',
        cardTitle: 'Price',
        text: 'The price has two decimals.',
        status: 'Supported',
        citations: [{ path: 'Models/Item.cs', startLine: 20, endLine: 24 }],
      },
    ]);
  });

  it('RNF-006 has no claims for a run without cards and no cost without a cost report', async () => {
    expect(await readRunClaims(writer(), scope)).toEqual([]);
    expect(await readRunCost(writer(), scope)).toBeNull();
  });

  it('RNF-006 refuses an index entry outside the cards of the run and a card that does not read', async () => {
    await runFile('cards/index.json', JSON.stringify({ cards: [{ path: 'cards/../../x.md' }] }));
    await expect(readRunClaims(writer(), scope)).rejects.toThrow('not a card file');

    await runFile('cards/index.json', JSON.stringify({ cards: [{ path: 'cards/BR/BR-001.md' }] }));
    await runFile('cards/BR/BR-001.md', '---\ntype: "STORY"\n---\n');
    await expect(readRunClaims(writer(), scope)).rejects.toThrow('BR-001.md');
  });

  it('RNF-012 reads the total cost of the run, and refuses a cost report that does not read', async () => {
    await runFile('cost.json', JSON.stringify({ totals: { costMicros: 1234 } }));
    expect(await readRunCost(writer(), scope)).toBe(1234);

    await runFile('cost.json', '{ "totals": ');
    await expect(readRunCost(writer(), scope)).rejects.toThrow('cost.json');
  });
});
