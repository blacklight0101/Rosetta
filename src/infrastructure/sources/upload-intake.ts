import { createHash, type Hash } from 'node:crypto';
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

/** Counts and hashes the bytes, enforces the limit and checks the first four bytes. */
export class Receiving extends Transform {
  bytes = 0;
  private readonly hash: Hash = createHash('sha256');
  private digest: string | undefined;
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
    this.hash.update(chunk);
    done(null, chunk);
  }

  /** `sha256:` and the hex digest of what passed; the same value on every read after the end of the body. */
  get sha256(): string {
    this.digest ??= `sha256:${this.hash.digest('hex')}`;
    return this.digest;
  }

  override _flush(done: TransformCallback): void {
    done(
      this.head.length < SIGNATURE_BYTES
        ? this.format.notReadable(`the file is not ${this.format.what}`)
        : null,
    );
  }
}

/**
 * Passes the chunks of `source` on, and fails when none arrives for `stallMs`. A stop (`signal`) ends the
 * wait at once: a body that is silent at that moment would otherwise hold the stop for `stallMs`.
 */
async function* withoutStalls(
  source: AsyncIterable<Uint8Array>,
  limits: { readonly stallMs: number; readonly signal: AbortSignal },
): AsyncGenerator<Uint8Array> {
  const { stallMs, signal } = limits;
  const iterator = source[Symbol.asyncIterator]();
  try {
    for (;;) {
      let timer: NodeJS.Timeout | undefined;
      const stalled = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(uploadTimedOut('stopped sending'));
        }, stallMs);
      });
      let stop: (() => void) | undefined;
      const stopped = new Promise<never>((_resolve, reject) => {
        stop = (): void => {
          reject(signal.reason instanceof Error ? signal.reason : new Error('stopped'));
        };
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
      });
      const next = await Promise.race([iterator.next(), stalled, stopped]).finally(() => {
        clearTimeout(timer);
        if (stop !== undefined) signal.removeEventListener('abort', stop);
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

/** What an upload came to: the bytes written and the hash of those same bytes (DEC-183). */
export interface ReceivedUpload {
  readonly bytes: number;
  /** `sha256:` and 64 lower-case hexadecimal characters. */
  readonly sha256: string;
}

/** Streams the body to `path` (which must not exist), hashing the bytes as they pass to the file. */
// RF-128, RF-129, RF-150, RF-152
export async function receiveUpload(request: IntakeRequest, path: string): Promise<ReceivedUpload> {
  const counter = new Receiving(request.limitBytes, request.format ?? ZIP_FORMAT);
  try {
    await pipeline(
      withoutStalls(request.body, { stallMs: request.stallMs, signal: request.signal }),
      counter,
      createWriteStream(path, { flags: 'wx' }),
      { signal: request.signal },
    );
  } catch (error) {
    const { signal } = request;
    if (signal.aborted && signal.reason instanceof Error) throw signal.reason;
    if (isFileSystemFailure(error)) throw snapshotWriteFailed('upload could not be stored', error);
    throw error;
  }
  return { bytes: counter.bytes, sha256: counter.sha256 };
}

/** Streams the body to `zipPath` (which must not exist) and returns the bytes written. */
// RF-128, RF-129, RF-150
export async function receiveZip(request: IntakeRequest, zipPath: string): Promise<number> {
  return (await receiveUpload(request, zipPath)).bytes;
}
