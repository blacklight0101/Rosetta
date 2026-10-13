import { open } from 'node:fs/promises';

// RF-1006, RNF-002: the last complete line of a file, read backwards from its end in chunks, so
// the last record of a long JSON Lines file is found without reading the file whole. A last
// fragment without a line break (a torn write) is not a line. A line break is one byte that never
// occurs inside a UTF-8 character, so the bytes are split before they are decoded.

const CHUNK_BYTES = 65_536;
const LINE_BREAK = 0x0a;

/** The last complete line of the file at `path` (without its line break); undefined if none. */
export async function lastCompleteLineOf(path: string): Promise<string | undefined> {
  const handle = await open(path, 'r');
  try {
    let position = (await handle.stat()).size;
    let tail = Buffer.alloc(0);
    while (position > 0) {
      const size = Math.min(CHUNK_BYTES, position);
      position -= size;
      const chunk = Buffer.alloc(size);
      await handle.read(chunk, 0, size, position);
      tail = Buffer.concat([chunk, tail]);
      const line = lineIn(tail, position === 0);
      if (line !== undefined) return line;
    }
    return undefined;
  } finally {
    await handle.close();
  }
}

/** The last complete line in the bytes at the end of a file, once its start is among them. */
function lineIn(tail: Buffer, atStart: boolean): string | undefined {
  const end = tail.lastIndexOf(LINE_BREAK);
  if (end < 0) return undefined;
  const before = end === 0 ? -1 : tail.lastIndexOf(LINE_BREAK, end - 1);
  if (before < 0 && !atStart) return undefined;
  return tail.subarray(before + 1, end).toString('utf8');
}
