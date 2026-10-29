import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SnapshotStore } from '../../../../src/infrastructure/github/snapshot-store.js';
import { buildWorkbook, row, sharedCell, worksheet } from '../../../support/workbook-fixtures.js';
import {
  projectId,
  stageFiles,
  uploadedAt,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';

// RF-152, P5-50: the bytes of a snapshot are the bytes of the text written. Text outside ASCII takes
// more bytes than characters, so the total must count bytes, not UTF-16 units.

const TEXT = 'Précio — 5 € 漢字 😀';
const folders = useStagingFolders(afterEach);

async function* filesUnder(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* filesUnder(path);
    else yield path;
  }
}

describe('workbook snapshot, bytes of non-ASCII cell text', () => {
  it('P5-50 gives the total bytes that Buffer.byteLength counts for the rendered text', async () => {
    const { staging, dataDir } = await folders();
    const book = await buildWorkbook({
      sheets: [{ name: 'Résumé', xml: worksheet(row(1, sharedCell('A1', 0))) }],
      sharedStrings: [TEXT],
    });
    const { id } = await stageFiles(staging, [['Café.xlsx', book]]);
    const published = await staging.publish(id, {
      projectId,
      uploadedAt,
      signal: new AbortController().signal,
    });

    const store = new SnapshotStore(dataDir);
    let rendered = '';
    let bytes = 0;
    let units = 0;
    for await (const path of filesUnder(store.filesDir(published.key))) {
      const content = await readFile(path, 'utf8');
      rendered += content;
      bytes += Buffer.byteLength(content);
      units += content.length;
    }

    expect(rendered).toContain(TEXT);
    expect(units).toBeLessThan(bytes);
    expect(published.info.totalBytes).toBe(bytes);
  });
});
