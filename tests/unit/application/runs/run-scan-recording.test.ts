import { describe, expect, it } from 'vitest';
import type { SourceFetcher } from '../../../../src/application/ports/source-fetcher.js';
import { projectSettingsSchema } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { settingsWith } from '../../../support/project-fixtures.js';
import { createScanRunHarness, RecordingPipeline } from '../../../support/scan-run-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-127, RF-147, RNF-002: what RunScan records in the manifest and leaves on disk when a run is
// edited while queued, stopped or failed.

const temp = useTempRoot('rosetta-run-scan-record-');

describe('RunScan settings recorded at acceptance', () => {
  it('RF-147 scans with the settings the run was accepted with, not the ones edited while it waited', async () => {
    const pipeline = new RecordingPipeline();
    const held: { release: () => void } = { release: () => undefined };
    let calls = 0;
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline,
      project: {
        settings: projectSettingsSchema.parse(settingsWith({ 'scan.allowDenied': ['.env'] })),
      },
      fetcher: (inner) => ({
        fetch: async (ref, signal) => {
          calls += 1;
          if (calls === 1) {
            await new Promise<void>((resolve) => {
              held.release = resolve;
            });
          }
          return inner.fetch(ref, signal);
        },
      }),
    });
    const first = await h.start();
    const second = await h.start();
    await h.updateSettings(projectSettingsSchema.parse(settingsWith({ 'scan.allowDenied': [] })));
    held.release();
    await h.ended(first);

    const run = await h.ended(second);

    expect(pipeline.requests.at(-1)?.settings.allowDenied).toEqual(['.env']);
    expect((await h.manifestOf(run)).security.allowDenied).toEqual(['.env']);
  });
});

describe('RunScan and the manifest of a stopped or failed run', () => {
  const withLinks = (inner: { fetch: SourceFetcher['fetch'] }): SourceFetcher => ({
    fetch: async (ref, signal) => ({ ...(await inner.fetch(ref, signal)), skippedLinks: 3 }),
  });

  it('RF-127 records the skipped links of a run that fails after the scan counted them', async () => {
    const pipeline = new RecordingPipeline();
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline: {
        scan: () => Promise.reject(new RosettaError(ERROR_CODES.codeMapInvalid)),
        discard: (scope) => pipeline.discard(scope),
      },
      fetcher: withLinks,
    });

    const run = await h.scan();

    expect(run.endState).toBe('Failed');
    expect((await h.manifestOf(run)).security.skippedLinks).toBe(3);
  });

  it('RF-127 records the skipped links of a run stopped after the fetch', async () => {
    const holder: { stop: () => Promise<void> } = { stop: () => Promise.resolve() };
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline: new RecordingPipeline(),
      fetcher: (inner) => {
        const linked = withLinks(inner);
        return {
          fetch: async (ref, signal) => {
            const snapshot = await linked.fetch(ref, signal);
            await holder.stop();
            return snapshot;
          },
        };
      },
    });
    holder.stop = () => h.stopRunning();

    const run = await h.scan();

    expect(run.endState).toBe('Interrupted');
    expect((await h.manifestOf(run)).security.skippedLinks).toBe(3);
  });
});

describe('RunScan output files of a stopped run', () => {
  it('RNF-002 removes the output files of a run stopped after the scan wrote them', async () => {
    const pipeline = new RecordingPipeline();
    const holder: { stop: () => Promise<void> } = { stop: () => Promise.resolve() };
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline: {
        scan: async (request) => {
          const report = await pipeline.scan(request);
          await holder.stop();
          return report;
        },
        discard: (scope) => pipeline.discard(scope),
      },
    });
    holder.stop = () => h.stopRunning();

    const run = await h.scan();

    expect(run.endState).toBe('Interrupted');
    expect(pipeline.discarded).toHaveLength(1);
    expect(pipeline.discarded[0]).toMatchObject({ runKey: run.runKey });
  });
});
