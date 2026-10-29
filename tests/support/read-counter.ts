import type { FileHandle } from 'node:fs/promises';
import { Transform } from 'node:stream';

// P5-50, RF-152, DEC-183: the counter behind the no-re-read tests. Every read a test wraps is noted
// with its path and the bytes it returned, whichever node API made it.

export const readsByPath = new Map<string, number>();

export function clearReads(): void {
  readsByPath.clear();
}

export function noteRead(path: unknown, bytes: number): void {
  const key = String(path);
  readsByPath.set(key, (readsByPath.get(key) ?? 0) + bytes);
}

export function byteLength(value: string | Uint8Array): number {
  return typeof value === 'string' ? Buffer.byteLength(value) : value.length;
}

/** Passes the chunks of a stream on, noting each one. */
export function countStream(stream: NodeJS.ReadableStream, path: unknown): NodeJS.ReadableStream {
  return stream.pipe(
    new Transform({
      transform(chunk: Buffer, _encoding, done) {
        noteRead(path, chunk.length);
        done(null, chunk);
      },
    }),
  );
}

/** A file handle whose `read`, `readFile` and `createReadStream` are noted. */
export function countHandle(handle: FileHandle, path: string): FileHandle {
  return new Proxy(handle, {
    get(target, name) {
      const value: unknown = Reflect.get(target, name, target);
      if (typeof value !== 'function') return value;
      const method = value as (...args: unknown[]) => unknown;
      if (name === 'read') {
        return async (...args: unknown[]) => {
          const result = (await method.apply(target, args)) as { bytesRead: number };
          noteRead(path, result.bytesRead);
          return result;
        };
      }
      if (name === 'readFile') {
        return async (...args: unknown[]) => {
          const bytes = (await method.apply(target, args)) as string | Uint8Array;
          noteRead(path, byteLength(bytes));
          return bytes;
        };
      }
      if (name === 'createReadStream') {
        return (...args: unknown[]) =>
          countStream(method.apply(target, args) as NodeJS.ReadableStream, path);
      }
      return method.bind(target);
    },
  });
}
