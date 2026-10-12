import { expect, it } from 'vitest';
import type { RunManifestStore } from '../../src/application/ports/run-manifest-store.js';
import { endManifest } from '../../src/domain/runs/run-manifest.js';
import { scopeFor } from '../support/run-event-fixtures.js';
import { sampleManifest } from '../support/run-fixtures.js';

// Architecture section 7: every RunManifestStore (the file store, the memory store) passes this
// suite. RF-003: the manifest is written when the run is accepted, rewritten when it starts and at
// the end; the last write wins and nothing else changes.

export type FreshManifests = () => Promise<RunManifestStore>;

const scope = scopeFor('20261012-100000-scan');
const otherScope = scopeFor('20261012-100000-understand');

export function runManifestStoreContract(name: string, fresh: FreshManifests): void {
  it(`RF-003 ${name} stores a manifest and reads it back unchanged`, async () => {
    const store = await fresh();
    const manifest = sampleManifest({ options: { areas: ['catalog'], consent: true } });

    await store.write(scope, manifest);

    expect(await store.read(scope)).toEqual(manifest);
  });

  it(`RF-003 ${name} reads nothing for a run that has no manifest`, async () => {
    const store = await fresh();

    expect(await store.read(scope)).toBeUndefined();
  });

  it(`RF-003 ${name} replaces the manifest when the run ends, with its end state and time`, async () => {
    const store = await fresh();
    const started = sampleManifest({ startedAt: '2026-10-12T10:00:05.000Z' });
    await store.write(scope, started);
    const ended = endManifest(started, 'Interrupted', '2026-10-12T10:05:00.000Z');
    if (!ended.ok) throw new Error('The manifest did not end');

    await store.write(scope, ended.value);

    expect(await store.read(scope)).toMatchObject({
      endState: 'Interrupted',
      endedAt: '2026-10-12T10:05:00.000Z',
      startedAt: '2026-10-12T10:00:05.000Z',
    });
  });

  it(`RF-003 ${name} keeps the manifests of two runs apart`, async () => {
    const store = await fresh();
    await store.write(scope, sampleManifest());
    await store.write(otherScope, sampleManifest({ stage: 'understand' }));

    expect((await store.read(scope))?.stage).toBe('scan');
    expect((await store.read(otherScope))?.stage).toBe('understand');
  });
}
