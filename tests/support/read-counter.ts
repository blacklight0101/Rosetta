import type { FileHandle } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';

// P5-50, P7-18, RF-152, DEC-183: the counter behind the no-re-read tests. Every read a test wraps is
// noted with its path and the bytes it returned, whichever node API made it.

export const readsByPath = new Map<string, number>();
const pathsByFd = new Map<number, string>();

export function clearReads(): void {
  readsByPath.clear();
}

export function noteRead(path: unknown, bytes: number): void {
  const key = String(path);
  readsByPath.set(key, (readsByPath.get(key) ?? 0) + bytes);
}

/** A sync read by file descriptor is noted under the path the descriptor was opened with. */
export function notePathOfFd(fd: number, path: unknown): void {
  pathsByFd.set(fd, String(path));
}

export function forgetFd(fd: number): void {
  pathsByFd.delete(fd);
}

export function noteFdRead(fd: number, bytes: number): void {
  noteRead(pathsByFd.get(fd) ?? fd, bytes);
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

function isBytesRead(value: unknown): value is { bytesRead: number } {
  return typeof value === 'object' && value !== null && 'bytesRead' in value
    ? typeof value.bytesRead === 'number'
    : false;
}

/** A file handle whose `read`, `readFile` and `createReadStream` are noted. */
export function countHandle(handle: FileHandle, path: string): FileHandle {
  return new Proxy(handle, {
    get(target, name) {
      const value: unknown = Reflect.get(target, name, target);
      if (typeof value !== 'function') return value;
      if (name === 'read') {
        return async (...args: unknown[]) => {
          const result: unknown = await Reflect.apply(value, target, args);
          if (isBytesRead(result)) noteRead(path, result.bytesRead);
          return result;
        };
      }
      if (name === 'readFile') {
        return async (...args: unknown[]) => {
          const bytes: unknown = await Reflect.apply(value, target, args);
          if (typeof bytes === 'string' || bytes instanceof Uint8Array) {
            noteRead(path, byteLength(bytes));
          }
          return bytes;
        };
      }
      if (name === 'createReadStream') {
        return (...args: unknown[]) => {
          const stream: unknown = Reflect.apply(value, target, args);
          return stream instanceof Readable ? countStream(stream, path) : stream;
        };
      }
      return (...args: unknown[]): unknown => Reflect.apply(value, target, args);
    },
  });
}
