import { describe, expect, it } from 'vitest';
import { projectSettingsSchema } from '../../../../src/application/projects/project-settings.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { settingsWith } from '../../../support/project-fixtures.js';
import type { SourceFetcher } from '../../../../src/application/ports/source-fetcher.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  createScanRunHarness,
  FAKE_COMMIT,
  FAKE_SNAPSHOT_HASH,
  RecordingPipeline,
} from '../../../support/scan-run-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-003, RF-121, RF-126, RF-1006, RF-1108: RunScan as the executor of the `scan` stage, with the
// scan pipeline replaced by a double.

const temp = useTempRoot('rosetta-run-scan-');

describe('RunScan manifest', () => {
  it('RF-126 records the commit, the snapshot hash and the snapshot folder of the run', async () => {
    const h = await createScanRunHarness({ dataDir: temp.path, pipeline: new RecordingPipeline() });

    const run = await h.scan();

    expect(run).toMatchObject({
      endState: 'Completed',
      commitSha: FAKE_COMMIT,
      snapshotKey: `octo__demo@${FAKE_COMMIT}`,
    });
    expect((await h.manifestOf(run)).source).toEqual({
      url: 'https://github.com/octo/demo',
      owner: 'octo',
      repo: 'demo',
      ref: '',
      commitSha: FAKE_COMMIT,
      subpath: '',
      snapshotHash: FAKE_SNAPSHOT_HASH,
    });
  });

  it('RF-003 records the code map hash and the end state in the manifest', async () => {
    const pipeline = new RecordingPipeline();
    const h = await createScanRunHarness({ dataDir: temp.path, pipeline });

    const manifest = await h.manifestOf(await h.scan());

    expect(manifest).toMatchObject({
      stage: 'scan',
      codemapHash: pipeline.report.codeMapHash,
      endState: 'Completed',
    });
    expect(manifest.endedAt).not.toBeNull();
  });
});

describe('RunScan events', () => {
  it('RF-1006 publishes the source and scan events between run.started and run.ended', async () => {
    const h = await createScanRunHarness({ dataDir: temp.path, pipeline: new RecordingPipeline() });

    const events = await h.eventsOf(await h.scan());

    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'source.resolved',
      'source.downloaded',
      'scan.completed',
      'run.ended',
    ]);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(events[1]?.data).toEqual({
      url: 'https://github.com/octo/demo',
      ref: 'main',
      commitSha: FAKE_COMMIT,
    });
    expect(events[2]?.data).toMatchObject({ fileCount: 20, totalBytes: 4096, cached: false });
    expect(events[3]?.data).toEqual({ files: 3, areas: 1, mapLevels: { coarse: 2, symbols: 1 } });
  });
});

describe('RunScan requests', () => {
  it('RF-100 hands the pipeline the snapshot folder, the subpath and the project scan settings', async () => {
    const pipeline = new RecordingPipeline();
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline,
      project: { subpath: 'Catalog' },
    });

    await h.scan();

    expect(pipeline.requests).toHaveLength(1);
    expect(pipeline.requests[0]).toMatchObject({
      source: { owner: 'octo', repo: 'demo', commitSha: FAKE_COMMIT, subpath: 'Catalog' },
      settings: h.project.settings.scan,
    });
    expect(pipeline.requests[0]?.root).toContain('webforms-csharp');
  });

  it('RF-121 asks the fetcher for the ref of the project', async () => {
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline: new RecordingPipeline(),
      project: { ref: 'main' },
    });

    await h.scan();

    expect(h.fetcher.fetched).toMatchObject([{ owner: 'octo', repo: 'demo', ref: 'main' }]);
  });
});

describe('RunScan failures', () => {
  it('RF-121 ends a run whose fetch fails as Failed with the code of the failure', async () => {
    const pipeline = new RecordingPipeline();
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline,
      project: { sourceUrl: 'https://github.com/octo/missing' },
    });

    const run = await h.scan();

    expect(run.endState).toBe('Failed');
    expect(pipeline.requests).toHaveLength(0);
    const events = await h.eventsOf(run);
    expect(events.map((event) => event.type)).toEqual(['run.started', 'run.ended']);
    expect(events.at(-1)?.data).toMatchObject({
      endState: 'Failed',
      errorCode: ERROR_CODES.githubSourceUnavailable,
    });
    expect((await h.manifestOf(run)).endState).toBe('Failed');
  });

  it('RF-003 ends a run whose project no longer exists as Failed with RST-2003', async () => {
    const pipeline = new RecordingPipeline();
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline,
      registerProject: false,
    });

    const run = await h.scan();

    expect(run.endState).toBe('Failed');
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({ errorCode: ERROR_CODES.notFound });
    expect(pipeline.requests).toHaveLength(0);
  });
});

describe('RunScan stops', () => {
  it('RNF-002 checks the abort signal after the fetch: a run stopped then is Interrupted and never scans', async () => {
    const pipeline = new RecordingPipeline();
    const holder: { stop: () => Promise<void> } = { stop: () => Promise.resolve() };
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline,
      fetcher: (inner) => ({
        fetch: async (ref, signal) => {
          const snapshot = await inner.fetch(ref, signal);
          await holder.stop();
          return snapshot;
        },
      }),
    });
    holder.stop = () => h.stopRunning();

    const run = await h.scan();

    expect(run.endState).toBe('Interrupted');
    expect(pipeline.requests).toHaveLength(0);
    const types = (await h.eventsOf(run)).map((event) => event.type);
    expect(types).not.toContain('scan.completed');
    expect(types.at(-1)).toBe('run.ended');
  });

  it('RNF-002 checks the abort signal after the scan: a run stopped then is Interrupted, not Completed', async () => {
    const holder: { stop: () => Promise<void> } = { stop: () => Promise.resolve() };
    const pipeline = new RecordingPipeline();
    const stopping = {
      scan: async (request: Parameters<RecordingPipeline['scan']>[0]) => {
        const report = await pipeline.scan(request);
        await holder.stop();
        return report;
      },
      discard: () => Promise.resolve(),
    };
    const h = await createScanRunHarness({ dataDir: temp.path, pipeline: stopping });
    holder.stop = () => h.stopRunning();

    const run = await h.scan();

    expect(run.endState).toBe('Interrupted');
    expect((await h.eventsOf(run)).map((event) => event.type)).not.toContain('scan.completed');
  });
});

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
