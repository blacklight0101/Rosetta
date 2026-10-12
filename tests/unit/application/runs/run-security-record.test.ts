import { describe, expect, it } from 'vitest';
import { ManifestSecurityRecorder } from '../../../../src/application/runs/run-security-record.js';
import { endManifest } from '../../../../src/domain/runs/run-manifest.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleManifest } from '../../../support/run-fixtures.js';

// RF-141, RF-009: the egress guard adds its mask counts and blocked calls to the run's manifest.

const scope = scopeFor('20261012-100000-understand');

async function storeWith(
  manifest = sampleManifest({ runId: scope.runKey }),
): Promise<MemoryRunManifestStore> {
  const manifests = new MemoryRunManifestStore();
  await manifests.write(scope, manifest);
  return manifests;
}

describe('ManifestSecurityRecorder', () => {
  it('RF-141 adds mask counts to the run record', async () => {
    const manifests = await storeWith();
    const recorder = new ManifestSecurityRecorder({ manifests, scope });

    await recorder.addMasking({ 'api-key': 1, password: 0 });
    await recorder.addMasking({ 'api-key': 2, password: 1 });

    expect((await manifests.read(scope))?.masking).toEqual({ 'api-key': 3, password: 1 });
  });

  it('RF-141 loses no count when calls of parallel agent tasks record at the same time', async () => {
    const manifests = await storeWith();
    const recorder = new ManifestSecurityRecorder({ manifests, scope });

    await Promise.all(
      [1, 2, 3, 4, 5].map(async () => {
        await recorder.addMasking({ password: 1 });
        await recorder.addBlockedCall();
      }),
    );

    const manifest = await manifests.read(scope);
    expect(manifest?.masking).toEqual({ password: 5 });
    expect(manifest?.security.blockedCalls).toBe(5);
  });

  it('RF-141 leaves the manifest of an ended run as it is', async () => {
    const ended = endManifest(sampleManifest(), 'Completed', '2026-10-12T10:05:00.000Z');
    if (!ended.ok) throw new Error('The manifest did not end');
    const manifests = await storeWith(ended.value);

    await new ManifestSecurityRecorder({ manifests, scope }).addBlockedCall();

    expect(await manifests.read(scope)).toEqual(ended.value);
  });

  it('RF-141 records nothing for a run without a manifest', async () => {
    const manifests = new MemoryRunManifestStore();

    await new ManifestSecurityRecorder({ manifests, scope }).addMasking({ password: 1 });

    expect(await manifests.read(scope)).toBeUndefined();
  });
});
