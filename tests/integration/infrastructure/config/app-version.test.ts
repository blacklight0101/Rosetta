import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { readAppVersion } from '../../../../src/infrastructure/config/app-version.js';

// RF-1303: /healthz reports the Rosetta version, read from the package.json shipped with the server.

const folders: string[] = [];

async function manifest(content: string): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'rst-version-'));
  folders.push(folder);
  const file = join(folder, 'package.json');
  await writeFile(file, content, 'utf8');
  return file;
}

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true })));
});

describe('readAppVersion', () => {
  it('RF-1303 reads the version of the package.json shipped with the server', async () => {
    const shipped: unknown = JSON.parse(
      await readFile(new URL('../../../../package.json', import.meta.url), 'utf8'),
    );

    const version = await readAppVersion();

    expect(shipped).toMatchObject({ version });
  });

  it('RF-1303 reads the version of a given package.json', async () => {
    const file = await manifest('{ "name": "rosetta", "version": "4.5.6" }');

    await expect(readAppVersion(file)).resolves.toBe('4.5.6');
  });

  it.each([['{ "name": "rosetta" }'], ['not json'], ['{ "version": "" }']])(
    'RF-1303 refuses a package.json without a version (%s) with RST-2500',
    async (content) => {
      const file = await manifest(content);

      await expect(readAppVersion(file)).rejects.toMatchObject({
        code: ERROR_CODES.versionUnreadable,
      });
    },
  );
});
