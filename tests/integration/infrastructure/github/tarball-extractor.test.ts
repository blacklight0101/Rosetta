import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTRACTION_LIMITS,
  extractTarball,
} from '../../../../src/infrastructure/github/tarball-extractor.js';
import { fixtureArchive } from '../../../support/snapshot-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-extractor-');

function bodyOf(bytes: Buffer): ReadableStream<Uint8Array> {
  return new Response(new Uint8Array(bytes)).body ?? new ReadableStream();
}

describe('extractTarball failures', () => {
  it('RF-122 a target folder that cannot be written fails with RST-1908, not a network code', async () => {
    const archive = await fixtureArchive('normal');
    const missingTarget = join(root.path, 'missing', 'files');

    await expect(
      extractTarball(
        bodyOf(archive),
        missingTarget,
        DEFAULT_EXTRACTION_LIMITS,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'RST-1908' });
  });

  it('RF-127 an archive cut off half way fails with RST-1907', async () => {
    const archive = (await fixtureArchive('normal')).subarray(0, 100);

    await expect(
      extractTarball(
        bodyOf(archive),
        root.path,
        DEFAULT_EXTRACTION_LIMITS,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'RST-1907' });
  });
});
