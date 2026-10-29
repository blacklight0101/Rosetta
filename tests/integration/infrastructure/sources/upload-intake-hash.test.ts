import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { describe, expect, it } from 'vitest';
import { Receiving, receiveUpload } from '../../../../src/infrastructure/sources/upload-intake.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { zipNotReadable } from '../../../../src/infrastructure/sources/zip-errors.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { bodyOf } from '../../../support/upload-store-harness.js';

// RF-128, RF-152, DEC-183, P5-47, P5-50: the intake hashes the body as it passes to the file.

const temp = useTempRoot('rst-intake-hash-');
const zipHead = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const zipFormat = {
  signatures: [[0x50, 0x4b, 0x03, 0x04]],
  what: 'a zip',
  notReadable: zipNotReadable,
};

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

  it('P5-50 gives the same SHA-256 when the hash is read a second time', async () => {
    const bytes = Buffer.concat([zipHead, Buffer.from('a body read twice')]);
    const counter = new Receiving(1024 * 1024, zipFormat);
    await pipeline(
      Readable.from([bytes]),
      counter,
      new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      }),
    );
    const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

    expect(counter.sha256).toBe(expected);
    expect(counter.sha256).toBe(expected);
  });
});
