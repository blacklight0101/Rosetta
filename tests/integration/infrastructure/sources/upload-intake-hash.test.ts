import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { receiveUpload } from '../../../../src/infrastructure/sources/upload-intake.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { bodyOf } from '../../../support/upload-store-harness.js';

// RF-128, RF-152, DEC-183, P5-47: the intake hashes the body as it passes to the file.

const temp = useTempRoot('rst-intake-hash-');
const zipHead = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function request(bytes: Buffer, limitBytes = 1024 * 1024) {
  return {
    body: bodyOf(bytes, 7),
    limitBytes,
    stallMs: 5_000,
    signal: new AbortController().signal,
  };
}

describe('receiveUpload', () => {
  it('RF-152 returns the byte count and the SHA-256 of what it wrote, in several chunks', async () => {
    const bytes = Buffer.concat([
      zipHead,
      Buffer.from('the rest of the body, longer than a chunk'),
    ]);
    const path = join(temp.path, 'a.part');

    const received = await receiveUpload(request(bytes), path);

    const written = await readFile(path);
    expect(written.equals(bytes)).toBe(true);
    expect(received.bytes).toBe(bytes.length);
    expect(received.sha256).toBe(`sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  });

  it('RF-129 still stops at the limit', async () => {
    const bytes = Buffer.concat([zipHead, Buffer.alloc(100)]);

    await expect(
      receiveUpload(request(bytes, 50), join(temp.path, 'b.part')),
    ).rejects.toMatchObject({ code: ERROR_CODES.uploadTooLarge });
  });
});
