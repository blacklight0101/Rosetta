import { describe, expect, it } from 'vitest';
import {
  decodeText,
  isBinary,
} from '../../../../../src/infrastructure/scan/universal/binary-detect.js';

describe('binary detection', () => {
  it('RF-100 a file with a zero byte is binary', () => {
    expect(isBinary(Uint8Array.of(97, 0, 98))).toBe(true);
  });

  it('RF-100 plain text, UTF-8 text and an empty file are not binary', () => {
    expect(isBinary(new TextEncoder().encode('line one\nline two\n'))).toBe(false);
    expect(isBinary(new TextEncoder().encode('café 中文'))).toBe(false);
    expect(isBinary(new Uint8Array(0))).toBe(false);
  });

  it('RF-100 text in UTF-16 with a byte order mark is not binary', () => {
    expect(isBinary(Uint8Array.of(0xff, 0xfe, 0x61, 0x00, 0x62, 0x00))).toBe(false);
    expect(isBinary(Uint8Array.of(0xfe, 0xff, 0x00, 0x61, 0x00, 0x62))).toBe(false);
  });

  it('RF-100 only the first 8000 bytes are examined', () => {
    const bytes = new Uint8Array(9000).fill(97);
    bytes[8500] = 0;

    expect(isBinary(bytes)).toBe(false);
    bytes[7999] = 0;
    expect(isBinary(bytes)).toBe(true);
  });

  it('RF-101 decodes UTF-8 without its byte order mark', () => {
    expect(decodeText(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61, 0x62))).toBe('ab');
  });

  it('RF-101 decodes UTF-16 in both byte orders', () => {
    expect(decodeText(Uint8Array.of(0xff, 0xfe, 0x61, 0x00, 0x62, 0x00))).toBe('ab');
    expect(decodeText(Uint8Array.of(0xfe, 0xff, 0x00, 0x61, 0x00, 0x62))).toBe('ab');
  });

  it('RF-101 bytes that are not valid UTF-8 are replaced, never thrown on', () => {
    expect(decodeText(Uint8Array.of(0x61, 0xff, 0x62))).toBe('a�b');
  });
});
