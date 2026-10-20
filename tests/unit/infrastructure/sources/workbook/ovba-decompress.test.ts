import { expect, it } from 'vitest';
import { decompressOvba } from '../../../../../src/infrastructure/sources/workbook/ovba-decompress.js';
import { chunkHeader, compressOvba, rawChunkContainer } from '../../../../support/ovba-compress.js';

// RF-154, MS-OVBA 2.4.1: the examples of section 3.2 are the first tests; the hostile chunks follow.

const LIMIT = 1_000_000;

function hex(text: string): Buffer {
  return Buffer.from(text.replace(/\s+/g, ''), 'hex');
}

function valueOf(input: Uint8Array, limit = LIMIT): Buffer {
  const result = decompressOvba(input, limit);
  if (!result.ok) throw new Error(`${result.error.reason}: ${result.error.detail}`);
  return Buffer.from(result.value);
}

function reasonOf(input: Uint8Array, limit = LIMIT): string {
  const result = decompressOvba(input, limit);
  return result.ok ? 'ok' : result.error.reason;
}

it('RF-154 decompresses the normal compression example of section 3.2.1', () => {
  const compressed = hex(`01 2F B0 00 23 61 61 61 62 63 64 65 82 66 00 70
    61 67 68 69 6A 01 38 08 61 6B 6C 00 20 6D 6E 6F
    70 06 71 02 70 04 00 72 73 74 75 76 10 77 78 79
    7A 00 2C`);

  expect(valueOf(compressed).toString('latin1')).toBe(
    '#aaabcdefaaaaghijaaaaaklaaamnopqaaaaaaaaaaaarstuvwxyzaaa',
  );
});

it('RF-154 decompresses the maximum compression example of section 3.2.3', () => {
  expect(valueOf(hex('01 03 B0 02 61 45 00')).toString('latin1')).toBe('a'.repeat(73));
});

it('RF-154 decompresses a raw (uncompressed) chunk of 4096 bytes', () => {
  const data = Buffer.alloc(4096, 'xyz');

  expect(valueOf(rawChunkContainer(data)).equals(data)).toBe(true);
});

it('RF-154 decompresses several chunks of the test compressor, copy tokens included', () => {
  const text = Buffer.from(
    'Sub Run()\r\n  Total = Total + Rate * Units\r\nEnd Sub\r\n'.repeat(400),
  );

  expect(valueOf(compressOvba(text)).equals(text)).toBe(true);
});

it('RF-154 decompresses an empty container', () => {
  expect(valueOf(Buffer.from([1])).length).toBe(0);
});

it('RF-154 refuses a copy token at the start of a chunk', () => {
  const body = Buffer.from([0x01, 0x00, 0x00]);
  const input = Buffer.concat([Buffer.from([1]), chunkHeader(5), body]);

  expect(reasonOf(input)).toBe('corrupt');
});

it('RF-154 refuses a copy token that points before the start of its chunk', () => {
  const first = Buffer.concat([Buffer.from([1]), chunkHeader(5), Buffer.from([0, 0x7a, 0x7a])]);
  const body = Buffer.from([0x04, 0x61, 0x62, 0x00, 0x40]);
  const hostile = Buffer.concat([chunkHeader(7), body]);

  expect(reasonOf(Buffer.concat([first, hostile]))).toBe('corrupt');
  expect(reasonOf(Buffer.concat([Buffer.from([1]), hostile]))).toBe('corrupt');
});

it('RF-154 refuses a chunk header that claims more bytes than remain', () => {
  const input = Buffer.concat([Buffer.from([1]), chunkHeader(100), Buffer.from([0, 0x61, 0x62])]);

  expect(reasonOf(input)).toBe('corrupt');
});

it('RF-154 refuses a raw chunk that is not 4096 bytes', () => {
  const input = Buffer.concat([Buffer.from([1]), chunkHeader(10, false), Buffer.alloc(8)]);

  expect(reasonOf(input)).toBe('corrupt');
});

it('RF-154 refuses a literal after a chunk is already 4096 bytes long', () => {
  const body = Buffer.from([0x02, 0x61, 0xfc, 0x0f, 0x00, 0x62]);
  const input = Buffer.concat([Buffer.from([1]), chunkHeader(8), body]);

  expect(reasonOf(input)).toBe('corrupt');
});

it('RF-154 refuses a chunk that expands past 4096 bytes', () => {
  const body = Buffer.from([0x02, 0x61, 0xfd, 0x0f]);
  const input = Buffer.concat([Buffer.from([1]), chunkHeader(6), body]);

  expect(reasonOf(input)).toBe('corrupt');
});

it.each([
  ['an empty input', Buffer.alloc(0)],
  ['a wrong signature byte', Buffer.from([2, 0x00, 0xb0])],
  ['a chunk header without its signature bits', Buffer.from([1, 0x03, 0x80, 0, 0x61, 0x62, 0x63])],
  ['one stray byte after the last chunk', hex('01 03 B0 02 61 45 00 07')],
])('RF-154 refuses %s', (_name, input) => {
  expect(reasonOf(input)).toBe('corrupt');
});

it('RF-154 stops a small input that expands without bound at the output cap', () => {
  const expanding = Buffer.concat([chunkHeader(6), Buffer.from([0x02, 0x61, 0xfc, 0x0f])]);
  const input = Buffer.concat([Buffer.from([1]), ...Array.from({ length: 2000 }, () => expanding)]);

  expect(valueOf(input, 10_000_000).length).toBe(2000 * 4096);
  expect(reasonOf(input, 100_000)).toBe('too-large');
});
