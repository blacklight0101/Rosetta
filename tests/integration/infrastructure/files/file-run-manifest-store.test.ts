import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FileRunManifestStore } from '../../../../src/infrastructure/files/file-run-manifest-store.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { runManifestStoreContract } from '../../../contracts/run-manifest-store.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleManifest } from '../../../support/run-fixtures.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-003, RF-126, RNF-003, data-model.md section 3.6: the manifest file in a temporary data folder.
const data = useTempRoot('rosetta-manifest-');
const scope = scopeFor('20261012-100000-scan');

function openStore(): FileRunManifestStore {
  const masker = new SecretMasker();
  const logger = new MemoryLogger(new FixedClock('2026-10-12T10:00:00.000Z'), masker);
  return new FileRunManifestStore({
    writer: new NodeOutputWriter({ dataDir: data.path, logger }),
    masker,
  });
}

function manifestFile(): string {
  const folder = ['users', scope.userId, 'projects', scope.projectId, 'runs', scope.runKey];
  return join(data.path, ...folder, 'manifest.json');
}

describe('FileRunManifestStore', () => {
  runManifestStoreContract('FileRunManifestStore', () => Promise.resolve(openStore()));

  it('RF-003 writes manifest.json in the run folder as JSON', async () => {
    await openStore().write(scope, sampleManifest());

    const text = await readFile(manifestFile(), 'utf8');
    expect(JSON.parse(text)).toMatchObject({
      schemaVersion: 1,
      runId: scope.runKey,
      stage: 'scan',
    });
    expect(text.endsWith('\n')).toBe(true);
  });

  it('RNF-003 masks a secret in the options before the manifest is written', async () => {
    await openStore().write(scope, sampleManifest({ options: { note: fakeOpenAiKey } }));

    const text = await readFile(manifestFile(), 'utf8');
    expect(text).not.toContain(fakeOpenAiKey);
    expect(text).toContain('[MASKED:');
  });
});

describe('FileRunManifestStore and the mask counts', () => {
  it('RF-141 keeps the count of every secret kind a number, the password count too', async () => {
    const masking = {
      'api-key': 1,
      'bearer-token': 0,
      'connection-string': 2,
      password: 3,
      'private-key': 0,
    };
    await openStore().write(scope, sampleManifest({ masking }));

    expect(await openStore().read(scope)).toMatchObject({ masking });
  });
});

describe('FileRunManifestStore with a file it cannot use', () => {
  async function plant(content: string): Promise<void> {
    await mkdir(join(manifestFile(), '..'), { recursive: true });
    await writeFile(manifestFile(), content, 'utf8');
  }

  it('RF-003 reports a manifest that is not JSON as RST-2106', async () => {
    await plant('{"schemaVersion": 1, "runId":');

    await expect(openStore().read(scope)).rejects.toMatchObject({
      code: ERROR_CODES.runManifestFailed,
    });
  });

  it('DEC-43 refuses a manifest with a newer schema version instead of guessing', async () => {
    await plant(JSON.stringify({ ...sampleManifest(), schemaVersion: 2 }));

    await expect(openStore().read(scope)).rejects.toMatchObject({
      code: ERROR_CODES.runManifestFailed,
    });
  });
});
