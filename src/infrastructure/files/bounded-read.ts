import { open, stat } from 'node:fs/promises';

// RF-100, RF-144, P1-67: reads that never hold more than a limit of bytes, so a huge file in a
// snapshot cannot exhaust memory or reach an agent whole.

/**
 * The bytes of a file measured at `size` (at most `limit`), or undefined when it has grown since.
 * The buffer holds `size + 1` bytes, so its cost follows the file, never the limit.
 */
export async function readUpTo(
  path: string,
  size: number,
  limit: number,
): Promise<Uint8Array | undefined> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(size, limit) + 1);
    let filled = 0;
    for (let read = 1; read > 0 && filled < buffer.length; filled += read) {
      ({ bytesRead: read } = await handle.read(buffer, filled, buffer.length - filled, filled));
    }
    return filled >= buffer.length
      ? undefined
      : new Uint8Array(buffer.buffer, buffer.byteOffset, filled);
  } finally {
    await handle.close();
  }
}

/** The UTF-8 text of a file of at most `limit` bytes, or undefined when it is larger. */
export async function readTextUpTo(path: string, limit: number): Promise<string | undefined> {
  const { size } = await stat(path);
  if (size > limit) return undefined;
  const bytes = await readUpTo(path, size, limit);
  return bytes === undefined ? undefined : utf8Text(bytes);
}

/** The bytes read as UTF-8 text. */
export function utf8Text(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString('utf8');
}
