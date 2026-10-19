import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { UploadRequest } from '../../src/application/ports/upload-store.js';
import type { ZipExtractor } from '../../src/application/ports/zip-extractor.js';
import { buildZip } from './zip-fixtures.js';
import { YauzlZipExtractor } from '../../src/infrastructure/sources/zip-extractor.js';
import { DEFAULT_ZIP_LIMITS } from '../../src/infrastructure/sources/zip-limits.js';
import {
  ZipUploadStore,
  type ZipUploadStoreOptions,
} from '../../src/infrastructure/sources/zip-upload-store.js';

// RF-128, RF-129: the real upload store over a temporary data folder, and bodies to feed it.

export const projectId = '00000000-0000-4000-a000-000000000001';
export const otherProjectId = '00000000-0000-4000-a000-000000000002';
export const MB = 1024 * 1024;

export function storeIn(
  dataDir: string,
  options: Partial<Omit<ZipUploadStoreOptions, 'dataDir'>> = {},
): ZipUploadStore {
  const extractor: ZipExtractor = new YauzlZipExtractor(DEFAULT_ZIP_LIMITS);
  return new ZipUploadStore({ dataDir, extractor, ...options });
}

/** The body as an async iterable of chunks of at most `chunk` bytes. */
export async function* bodyOf(bytes: Buffer, chunk = 16 * 1024): AsyncGenerator<Uint8Array> {
  for (let at = 0; at < bytes.length; at += chunk) {
    yield bytes.subarray(at, at + chunk);
    await Promise.resolve();
  }
}

export function requestOf(
  body: AsyncIterable<Uint8Array>,
  overrides: Partial<UploadRequest> = {},
): UploadRequest {
  return {
    projectId,
    fileName: 'OrderDesk.zip',
    uploadedAt: '2026-10-19T08:00:00.000Z',
    body,
    declaredBytes: undefined,
    limitBytes: MB,
    signal: new AbortController().signal,
    ...overrides,
  };
}

/** What `<data>/sources/` holds: nothing when the folder was never created. */
export async function sourcesEntries(dataDir: string): Promise<string[]> {
  try {
    return (await readdir(join(dataDir, 'sources'))).sort();
  } catch {
    return [];
  }
}

export async function modeOf(path: string): Promise<number> {
  return (await stat(path)).mode;
}

/** A body that counts how often it was read. */
export function countingBody(bytes: Buffer): {
  body: AsyncIterable<Uint8Array>;
  reads: () => number;
} {
  let reads = 0;
  const body = (async function* () {
    reads += 1;
    await Promise.resolve();
    yield bytes;
  })();
  return { body, reads: () => reads };
}

/** Accepted by the signature check, larger than any limit used in the tests. */
export function endlessZipLike(): AsyncIterable<Uint8Array> {
  const head = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  return (async function* () {
    yield head;
    for (;;) {
      yield Buffer.alloc(64 * 1024, 1);
      await Promise.resolve();
    }
  })();
}

/** A small valid zip with one top-level folder. */
export function sampleZip(): Promise<Buffer> {
  return buildZip([
    { name: 'OrderDesk/src/Orders.cs', data: 'class Orders {}' },
    { name: 'OrderDesk/README.md', data: '# Order desk' },
  ]);
}
