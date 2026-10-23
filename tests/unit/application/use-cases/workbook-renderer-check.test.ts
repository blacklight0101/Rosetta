import { describe, expect, it } from 'vitest';
import type { Logger } from '../../../../src/application/ports/logger.js';
import type { SentSnapshot } from '../../../../src/application/ports/source-fetcher.js';
import { WorkbookRendererCheck } from '../../../../src/application/use-cases/workbook-renderer-check.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// RF-150, RF-152, P3-108, EV-23: the page learns that the stored workbooks were rendered by an older
// renderer. The original files are deleted when the batch ends (RF-152), so a scan cannot render them
// again: the user is told to upload them again.

const KEY = 'workbook__p-1@0123456789abcdef';
const upload = { fileName: 'Pricing.xlsx', uploadedAt: 1, snapshotKey: KEY, workbooks: 1 };

function checkWith(rendererVersion: string | undefined, kind: 'workbook' | 'upload' = 'workbook') {
  const snapshot =
    rendererVersion === undefined ? undefined : ({ kind, rendererVersion } as SentSnapshot);
  return new WorkbookRendererCheck({
    uploads: { read: () => Promise.resolve(snapshot) },
    currentVersion: '3',
    logger: { log: () => Promise.resolve() } as unknown as Logger,
  });
}

const workbookProject = sampleProject({ sourceKind: 'workbook', upload });

describe('WorkbookRendererCheck', () => {
  it('RF-152 tells a project rendered at version 2 that the renderer is older', async () => {
    expect(await checkWith('2').isOlder(workbookProject)).toBe(true);
  });

  it('RF-152 says nothing for a project at the current version', async () => {
    expect(await checkWith('3').isOlder(workbookProject)).toBe(false);
  });

  it('RF-152 says nothing for a project with no source, no snapshot, or another kind', async () => {
    const none = sampleProject({ sourceKind: 'workbook' });
    expect(await checkWith('2').isOlder(none)).toBe(false);
    expect(await checkWith(undefined).isOlder(workbookProject)).toBe(false);
    expect(await checkWith('2').isOlder(sampleProject({ sourceKind: 'upload', upload }))).toBe(
      false,
    );
  });
});

it('RF-152 a snapshot that cannot be read gives false and one warning, not an error', async () => {
  const entries: unknown[] = [];
  const check = new WorkbookRendererCheck({
    uploads: { read: () => Promise.reject(new Error('corrupt snapshot.json')) },
    currentVersion: '3',
    logger: {
      log: (entry: unknown) => {
        entries.push(entry);
        return Promise.resolve();
      },
    } as unknown as Logger,
  });

  expect(await check.isOlder(workbookProject)).toBe(false);
  expect(entries).toMatchObject([{ level: 'warn', logger: 'sources' }]);
});
