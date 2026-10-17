import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { loadEnvironment } from '../../../src/infrastructure/config/environment.js';
import { composeApplication } from '../../../src/presentation/composition-root.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';

// RF-606: a broken principle catalogue stops the start-up with its RST code, before the server
// listens and before the database is used.

const cleanups: string[] = [];

afterAll(async () => {
  await Promise.all(cleanups.map((path) => rm(path, { recursive: true, force: true })));
});

async function folderWith(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'rst-catalogue-start-'));
  cleanups.push(root);
  await mkdir(join(root, 'catalogue'));
  for (const [name, text] of Object.entries(files)) {
    await writeFile(join(root, 'catalogue', name), text);
  }
  return root;
}

describe('start-up with the principle catalogue', () => {
  it('RF-606 a catalogue file without a version stops the start-up with its code before the server listens', async () => {
    const promptsFolder = await folderWith({ 'notes.md': 'Notes.\n' });
    const dataDir = await mkdtemp(join(tmpdir(), 'rst-catalogue-data-'));
    cleanups.push(dataDir);
    const output: string[] = [];
    const application = composeApplication({
      environment: loadEnvironment({
        DATABASE_URL: 'postgres://rosetta:unused@127.0.0.1:1/rosetta',
        ROSETTA_SECRET_KEY: fixtureSecret(33),
        ROSETTA_PUBLIC_URL: 'http://127.0.0.1:8080',
        ROSETTA_DATA_DIR: dataDir,
      }),
      listen: { host: '127.0.0.1', port: 0 },
      output: { write: (text: string) => output.push(text) },
      promptsFolder,
    });

    await expect(application.start()).rejects.toMatchObject({
      code: ERROR_CODES.configurationInvalid,
    });

    expect(output.join('')).toContain(ERROR_CODES.configurationInvalid);
  });
});
