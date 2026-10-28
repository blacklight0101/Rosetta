import { describe, expect, it } from 'vitest';
import type { WorkbookProgress } from '../../../../src/application/ports/workbook-staging.js';
import { bodyOf, requestOf, storeIn } from '../../../support/upload-store-harness.js';
import { sampleBook } from '../../../support/workbook-staging-harness.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';
import { buildZip } from '../../../support/zip-fixtures.js';

// RF-159, DEC-183: a zip that holds workbooks shows the same progress, and a stop ends its rendering.

const root = useWritableTempRoot('rosetta-zip-progress-');

async function twoBooks(): Promise<Buffer> {
  const book = await sampleBook([{ name: 'Other' }]);
  return buildZip([
    { name: 'a/First.xlsx', data: book },
    { name: 'b/Second.xlsx', data: book },
  ]);
}

describe('ZipUploadStore progress', () => {
  it('RF-159 reports reading, rendering, dependencies and saving in order', async () => {
    const events: WorkbookProgress[] = [];
    const store = storeIn(root.path);

    await store.store(
      requestOf(bodyOf(await twoBooks()), { onProgress: (progress) => events.push(progress) }),
    );

    const steps = [...new Set(events.map((event) => event.step))];
    expect(steps).toEqual(['reading', 'rendering', 'dependencies', 'saving']);
    const reading = events.filter((event) => event.step === 'reading');
    expect(reading.map((event) => [event.workbook, event.workbooks])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(events.filter((event) => event.step === 'rendering')).toHaveLength(4);
  });

  it('RF-159 stops before the next sheet when the request is cancelled while rendering', async () => {
    const controller = new AbortController();
    const rendered: number[] = [];
    const store = storeIn(root.path);

    const onProgress = (progress: WorkbookProgress): void => {
      if (progress.step !== 'rendering') return;
      rendered.push(progress.sheet);
      if (rendered.length === 2) controller.abort(new Error('cancelled'));
    };
    const stored = store.store(
      requestOf(bodyOf(await twoBooks()), { signal: controller.signal, onProgress }),
    );

    await expect(stored).rejects.toThrow('cancelled');
    expect(rendered).toHaveLength(2);
  });
});
