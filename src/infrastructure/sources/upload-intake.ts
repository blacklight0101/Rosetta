import { createWriteStream } from 'node:fs';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { isFileSystemFailure, snapshotWriteFailed } from '../github/snapshot-errors.js';

import { zipNotReadable } from './zip-errors.js';

// RF-128, RF-129: the body of an upload on its way to a temporary file. It is streamed, never
// buffered; it stops at the size limit however many bytes the client declared, and a client that
// stops sending is cut off. The first bytes must be those of a zip.

const SIGNATURE_BYTES = 4;

/** What a body must start with, and the refusal when it does not (RF-128, RF-150). */
export interface IntakeFormat {
  readonly signatures: readonly (readonly number[])[];
  /** How the refusal names the format: `a zip`. */
  readonly what: string;
  readonly notReadable: (detail: string) => RosettaError;
}

/** `PK` and the local file header, the end of an empty archive, or the spanned-archive marker. */
const ZIP_FORMAT: IntakeFormat = {
  signatures: [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
  ],
  what: 'a zip',
  notReadable: zipNotReadable,
};

/** RST-1916: the archive passes the upload limit. */
export function uploadTooLarge(limitBytes: number): RosettaError {
  return new RosettaError(
    ERROR_CODES.uploadTooLarge,
    `The upload is larger than the limit of ${String(limitBytes)} bytes.`,
  );
}

/** RST-1918: the upload or its unpacking took longer than the server allows. */
export function uploadTimedOut(what: string): RosettaError {
  return new RosettaError(ERROR_CODES.uploadTimedOut, `The upload ${what} took too long.`);
}

/** True when the bytes seen so far can still start the format. */
function isHeadOf(format: IntakeFormat, head: Buffer): boolean {
  return format.signatures.some((signature) => head.every((byte, at) => byte === signature[at]));
}

/** Counts the bytes, enforces the limit and checks the first four bytes. */
class Receiving extends Transform {
  bytes = 0;
  private head: Buffer = Buffer.alloc(0);
  private readonly limit: number;
  private readonly format: IntakeFormat;

  constructor(limit: number, format: IntakeFormat) {
    super();
    this.limit = limit;
    this.format = format;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.limit) {
      done(uploadTooLarge(this.limit));
      return;
    }
    if (this.head.length < SIGNATURE_BYTES) {
      const missing = SIGNATURE_BYTES - this.head.length;
      this.head = Buffer.concat([this.head, chunk.subarray(0, missing)]);
      if (!isHeadOf(this.format, this.head)) {
        done(this.format.notReadable(`the file does not start like ${this.format.what}`));
        return;
      }
    }
    done(null, chunk);
  }

  override _flush(done: TransformCallback): void {
    done(
      this.head.length < SIGNATURE_BYTES
        ? this.format.notReadable(`the file is not ${this.format.what}`)
        : null,
    );
  }
}

/** Passes the chunks of `source` on, and fails when none arrives for `stallMs`. */
async function* withoutStalls(
  source: AsyncIterable<Uint8Array>,
  stallMs: number,
): AsyncGenerator<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    for (;;) {
      let timer: NodeJS.Timeout | undefined;
      const stalled = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(uploadTimedOut('stopped sending'));
        }, stallMs);
      });
      const next = await Promise.race([iterator.next(), stalled]).finally(() => {
        clearTimeout(timer);
      });
      if (next.done === true) return;
      yield next.value;
    }
  } finally {
    // A source that is stuck never answers `return`, so it is not awaited.
    void iterator.return?.().catch(() => undefined);
  }
}

export interface IntakeRequest {
  readonly body: AsyncIterable<Uint8Array>;
  readonly limitBytes: number;
  readonly stallMs: number;
  readonly signal: AbortSignal;
  /** A zip when left out (RF-128); a workbook batch names its own (RF-150). */
  readonly format?: IntakeFormat;
}

/** Streams the body to `zipPath` (which must not exist) and returns the bytes written. */
// RF-128, RF-129, RF-150
export async function receiveZip(request: IntakeRequest, zipPath: string): Promise<number> {
  const counter = new Receiving(request.limitBytes, request.format ?? ZIP_FORMAT);
  try {
    await pipeline(
      withoutStalls(request.body, request.stallMs),
      counter,
      createWriteStream(zipPath, { flags: 'wx' }),
      { signal: request.signal },
    );
  } catch (error) {
    const { signal } = request;
    if (signal.aborted && signal.reason instanceof Error) throw signal.reason;
    if (isFileSystemFailure(error)) throw snapshotWriteFailed('upload could not be stored', error);
    throw error;
  }
  return counter.bytes;
}
