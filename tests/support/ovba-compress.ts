// P3-45: a compressor for MS-OVBA section 2.4.1, written for the tests from the specification
// (greedy matching inside one 4096-byte chunk). The reader under test only decompresses; building
// compressed module streams in the test keeps every fixture first-party and out of the repository.

const CHUNK = 4096;
const SIGNATURE_BITS = 0x3000;
const COMPRESSED_FLAG = 0x8000;
/** Only the nearest bytes are searched for a match: smaller output is not the point of a fixture. */
const WINDOW = 256;

/** The number of offset bits of a copy token at `position` inside its chunk (section 2.4.1.3.19.1). */
export function offsetBits(position: number): number {
  return Math.max(32 - Math.clz32(position - 1), 4);
}

interface Match {
  readonly offset: number;
  readonly length: number;
}

function bestMatch(chunk: Uint8Array, position: number): Match | undefined {
  if (position === 0) return undefined;
  const bits = offsetBits(position);
  const maxLength = (0xffff >> bits) + 3;
  let best: Match | undefined;
  for (let offset = 1; offset <= Math.min(position, 1 << bits, WINDOW); offset++) {
    let length = 0;
    while (
      length < maxLength &&
      position + length < chunk.length &&
      chunk[position + length] === chunk[position - offset + length]
    ) {
      length++;
    }
    if (length >= 3 && (best === undefined || length > best.length)) best = { offset, length };
  }
  return best;
}

function compressChunk(chunk: Uint8Array): number[] {
  const out: number[] = [];
  let position = 0;
  while (position < chunk.length) {
    const flagAt = out.length;
    out.push(0);
    for (let bit = 0; bit < 8 && position < chunk.length; bit++) {
      const match = bestMatch(chunk, position);
      if (match === undefined) {
        out.push(chunk[position] ?? 0);
        position++;
        continue;
      }
      const bits = offsetBits(position);
      const token = ((match.offset - 1) << (16 - bits)) | (match.length - 3);
      out.push(token & 0xff, token >> 8);
      out[flagAt] = (out[flagAt] ?? 0) | (1 << bit);
      position += match.length;
    }
  }
  return out;
}

/** A compressed container (signature byte and one chunk per 4096 bytes). */
export function compressOvba(data: Uint8Array): Buffer {
  const out: number[] = [1];
  for (let start = 0; start < data.length; start += CHUNK) {
    const body = compressChunk(data.subarray(start, start + CHUNK));
    const header = (body.length + 2 - 3) | SIGNATURE_BITS | COMPRESSED_FLAG;
    out.push(header & 0xff, header >> 8, ...body);
  }
  return Buffer.from(out);
}

/** A container whose only chunk is stored raw: exactly 4096 bytes after a header without the flag. */
export function rawChunkContainer(data: Uint8Array): Buffer {
  if (data.length !== CHUNK) throw new Error('A raw chunk holds exactly 4096 bytes');
  const header = (CHUNK + 2 - 3) | SIGNATURE_BITS;
  return Buffer.concat([Buffer.from([1, header & 0xff, header >> 8]), data]);
}

/** A chunk header for hand-made hostile chunks: `size` is the whole chunk, header included. */
export function chunkHeader(size: number, compressed = true): Buffer {
  const value = (size - 3) | SIGNATURE_BITS | (compressed ? COMPRESSED_FLAG : 0);
  return Buffer.from([value & 0xff, (value >> 8) & 0xff]);
}
