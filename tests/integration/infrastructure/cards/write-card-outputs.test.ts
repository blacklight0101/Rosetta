import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeCardOutputs } from '../../../../src/infrastructure/cards/write-card-outputs.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { cardSource } from '../../../support/card-fixtures.js';
import {
  cardLogger,
  cardsOf,
  smallRun,
  withRejectedFirstClaim,
} from '../../../support/card-output-harness.js';
import { openWriter } from '../../../support/open-writer.js';
import { RefusingWriter } from '../../../support/refusing-writer.js';
import { useTempRoot } from '../../../support/temp-root.js';

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const folder = 'projects/p1/runs/20261012-100000-understand';

function inputOf(cards = cardsOf()) {
  return { cards, source: cardSource, masker: new SecretMasker(), logger: cardLogger() };
}

/** Every file under the run folder with its bytes, by path relative to the folder. */
async function snapshotOf(root: string): Promise<Map<string, string>> {
  const runFolder = join(root, 'users', userId, ...folder.split('/'));
  const entries = await readdir(runFolder, { recursive: true, withFileTypes: true });
  const files = new Map<string, string>();
  for (const entry of entries.filter((item) => item.isFile())) {
    const path = join(entry.parentPath, entry.name);
    files.set(path.slice(runFolder.length + 1).replaceAll('\\', '/'), await readFile(path, 'hex'));
  }
  return files;
}

describe('card writers on the real output writer', () => {
  const data = useTempRoot('rosetta-cards-');

  it('RF-302 cards written to the run folder can be read back, and a rewrite keeps every claim', async () => {
    const outputs = openWriter(data.path);

    const first = await writeCardOutputs(outputs, { userId, folder }, inputOf());
    const second = await writeCardOutputs(outputs, { userId, folder }, inputOf());

    expect(first.ok && second.ok).toBe(true);
    const index = await outputs.readText({ userId, path: `${folder}/cards/index.json` });
    const listed: unknown = index.ok ? JSON.parse(index.value) : undefined;
    expect(JSON.stringify(listed).match(/"id"/g)).toHaveLength(7);
    const card = await outputs.readText({ userId, path: `${folder}/cards/OQ/OQ-001.md` });
    expect(card.ok && card.value).toContain('Which roles may cancel a paid order?');
  });

  it('RF-005 a folder that leaves the workspace is refused', async () => {
    const result = await writeCardOutputs(
      openWriter(data.path),
      { userId, folder: '../other' },
      inputOf(),
    );

    expect(result.ok).toBe(false);
  });
});

describe('a refused card rewrite on the real output writer', () => {
  const data = useTempRoot('rosetta-cards-');

  it('RF-302 a rewrite refused at the third write leaves the four earlier files byte-identical', async () => {
    const outputs = openWriter(data.path);
    const first = await writeCardOutputs(outputs, { userId, folder }, inputOf(smallRun()));
    const before = await snapshotOf(data.path);

    const rewrite = await writeCardOutputs(
      new RefusingWriter(outputs, 3),
      { userId, folder },
      inputOf(withRejectedFirstClaim(smallRun(true))),
    );

    expect(first.ok).toBe(true);
    expect(rewrite.ok).toBe(false);
    expect([...before.keys()].sort()).toEqual([
      'cards/FEAT/FEAT-001.md',
      'cards/OQ/OQ-001.md',
      'cards/index.json',
      'spec.md',
    ]);
    expect(await snapshotOf(data.path)).toEqual(before);
  });

  it('RNF-002 a rewrite refused after writing a new card leaves no new file behind', async () => {
    const outputs = openWriter(data.path);
    await writeCardOutputs(outputs, { userId, folder }, inputOf(smallRun()));
    const before = await snapshotOf(data.path);

    const rewrite = await writeCardOutputs(
      new RefusingWriter(outputs, 5),
      { userId, folder },
      inputOf(smallRun(true)),
    );

    expect(rewrite.ok).toBe(false);
    expect(await snapshotOf(data.path)).toEqual(before);
  });
});
