import { err, ok, type Result } from '../../../domain/errors/result.js';

// RF-154, MS-OVBA section 2.4.1: the decompression of a compressed container. Every length in the
// input is chosen by whoever made the file, so each chunk is checked against the bytes that remain,
// each copy token against the start of its chunk, and the output against a cap before it grows.

export interface OvbaFailure {
  readonly reason: 'corrupt' | 'too-large';
  readonly detail: string;
}

const CHUNK_SIZE = 4096;
const SIGNATURE_BYTE = 0x01;
const CHUNK_SIGNATURE = 0b011;
const MIN_COPY_LENGTH = 3;

function byteAt(data: Uint8Array, at: number): number {
  return data[at] ?? 0;
}

function wordAt(data: Uint8Array, at: number): number {
  return byteAt(data, at) | (byteAt(data, at + 1) << 8);
}

function corrupt(detail: string): Result<never, OvbaFailure> {
  return err({ reason: 'corrupt', detail });
}

/** The bit count that splits a copy token into offset and length at `position` (2.4.1.3.19.1). */
function offsetBitCount(position: number): number {
  return Math.max(32 - Math.clz32(position - 1), 4);
}

/** The output of one chunk: at most 4096 bytes, copied from itself and never from an earlier chunk. */
class ChunkOutput {
  private readonly bytes = new Uint8Array(CHUNK_SIZE);
  private written = 0;

  literal(byte: number): string | undefined {
    if (this.written >= CHUNK_SIZE) return 'a chunk holds more than 4096 bytes';
    this.bytes[this.written++] = byte;
    return undefined;
  }

  copy(token: number): string | undefined {
    // At the start of a chunk there is nothing to copy: the source below is always negative.
    const bits = offsetBitCount(this.written);
    const length = (token & (0xffff >> bits)) + MIN_COPY_LENGTH;
    const source = this.written - ((token >> (16 - bits)) + 1);
    if (source < 0) return 'a copy token points before the start of its chunk';
    if (this.written + length > CHUNK_SIZE) return 'a chunk holds more than 4096 bytes';
    for (let i = 0; i < length; i++) this.bytes[this.written + i] = this.bytes[source + i] ?? 0;
    this.written += length;
    return undefined;
  }

  result(): Uint8Array {
    return this.bytes.subarray(0, this.written);
  }
}

/** Decodes the token sequences of one compressed chunk (`start` to `end` in `data`). */
function decodeTokens(
  data: Uint8Array,
  start: number,
  end: number,
): Result<Uint8Array, OvbaFailure> {
  const out = new ChunkOutput();
  let at = start;
  while (at < end) {
    const flags = byteAt(data, at++);
    for (let bit = 0; bit < 8 && at < end; bit++) {
      const isCopy = (flags & (1 << bit)) !== 0;
      if (isCopy && at + 2 > end) return corrupt('a copy token is cut short');
      const problem = isCopy ? out.copy(wordAt(data, at)) : out.literal(byteAt(data, at));
      if (problem !== undefined) return corrupt(problem);
      at += isCopy ? 2 : 1;
    }
  }
  return ok(out.result());
}

function decodeChunk(
  data: Uint8Array,
  at: number,
): Result<{ bytes: Uint8Array; end: number }, OvbaFailure> {
  if (at + 2 > data.length) return corrupt('a chunk header is cut short');
  const header = wordAt(data, at);
  if (((header >> 12) & 0b111) !== CHUNK_SIGNATURE) return corrupt('a chunk has a wrong signature');
  const end = at + (header & 0x0fff) + 3;
  if (end > data.length) return corrupt('a chunk claims more bytes than remain');
  if ((header & 0x8000) === 0) {
    if (end - at - 2 !== CHUNK_SIZE) return corrupt('a raw chunk is not 4096 bytes');
    return ok({ bytes: data.subarray(at + 2, end), end });
  }
  const tokens = decodeTokens(data, at + 2, end);
  return tokens.ok ? ok({ bytes: tokens.value, end }) : tokens;
}

/** Decompresses a container; refuses it when the result would pass `maxBytes`. */
export function decompressOvba(
  input: Uint8Array,
  maxBytes: number,
): Result<Uint8Array, OvbaFailure> {
  if (input[0] !== SIGNATURE_BYTE) return corrupt('the container does not start with 0x01');
  const chunks: Uint8Array[] = [];
  let total = 0;
  let at = 1;
  while (at < input.length) {
    const chunk = decodeChunk(input, at);
    if (!chunk.ok) return chunk;
    total += chunk.value.bytes.length;
    if (total > maxBytes) {
      return err({ reason: 'too-large', detail: `more than ${String(maxBytes)} bytes` });
    }
    chunks.push(chunk.value.bytes);
    at = chunk.value.end;
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const bytes of chunks) {
    output.set(bytes, offset);
    offset += bytes.length;
  }
  return ok(output);
}
