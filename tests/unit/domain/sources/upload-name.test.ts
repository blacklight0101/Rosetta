import { describe, expect, it } from 'vitest';
import {
  uploadFileName,
  uploadKeyPrefix,
  uploadSnapshotKey,
} from '../../../../src/domain/sources/upload-name.js';

// RF-128, RF-130, RFC-004 section 4.1: the recorded name of an upload and its snapshot key.

const projectId = '00000000-0000-4000-a000-000000000001';
const hash = `sha256:${'0123456789abcdef'.repeat(4)}`;

describe('uploadSnapshotKey', () => {
  it('RF-130 is upload__<project id>@ and the first 16 hex of the hash', () => {
    expect(uploadSnapshotKey(projectId, hash)).toBe(`upload__${projectId}@0123456789abcdef`);
  });

  it('RF-130 every key of the project starts with its prefix', () => {
    expect(uploadSnapshotKey(projectId, hash).startsWith(uploadKeyPrefix(projectId))).toBe(true);
    expect(uploadKeyPrefix(projectId)).toBe(`upload__${projectId}@`);
  });
});

describe('uploadFileName', () => {
  it('RF-128 keeps the name the page sent', () => {
    expect(uploadFileName('OrderDesk.zip', 'Other')).toEqual({ ok: true, value: 'OrderDesk.zip' });
  });

  it('RF-128 decodes a percent-encoded name', () => {
    expect(uploadFileName('Caf%C3%A9%20App.ZIP', 'x')).toEqual({ ok: true, value: 'Café App.ZIP' });
  });

  it('RF-128 uses the project name when the page sent none', () => {
    expect(uploadFileName(undefined, 'OrderDesk')).toEqual({ ok: true, value: 'OrderDesk.zip' });
  });

  it('RF-128 keeps only the base name of a path', () => {
    expect(uploadFileName('..%2F..%5Cevil%2FOrderDesk.zip', 'x')).toEqual({
      ok: true,
      value: 'OrderDesk.zip',
    });
  });

  it('RF-128 drops control characters', () => {
    expect(uploadFileName('Order%00%0ADesk.zip', 'x')).toEqual({
      ok: true,
      value: 'OrderDesk.zip',
    });
  });

  it('RF-128 cuts a long name to 200 characters, keeping the extension', () => {
    const result = uploadFileName(`${'a'.repeat(300)}.zip`, 'x');

    expect(result).toEqual({ ok: true, value: `${'a'.repeat(196)}.zip` });
  });

  it.each(['OrderDesk.rar', 'OrderDesk', '.zip%20'])('RF-128 refuses the name %s', (sent) => {
    expect(uploadFileName(sent, 'x')).toEqual({ ok: false, error: 'not-a-zip-name' });
  });

  it('RF-128 answers bad-encoding, not not-a-zip-name, for a name that is not valid percent-encoding', () => {
    expect(uploadFileName('%E0%A4%A.zip', 'x')).toEqual({ ok: false, error: 'bad-encoding' });
    expect(uploadFileName('%E0%A4%A', 'x')).toEqual({ ok: false, error: 'bad-encoding' });
  });
});

describe('uploadFileName hostile and long names', () => {
  it.each([
    ['U+202E right-to-left override', '‮'],
    ['U+202A', '‪'],
    ['U+202B', '‫'],
    ['U+202C', '‬'],
    ['U+202D', '‭'],
    ['U+2066', '⁦'],
    ['U+2067', '⁧'],
    ['U+2068', '⁨'],
    ['U+2069', '⁩'],
    ['U+200E left-to-right mark', '‎'],
    ['U+200F right-to-left mark', '‏'],
  ])('RF-128 strips %s from the name', (_label, mark) => {
    const sent = encodeURIComponent(`${mark}gnp${mark}.zip`);

    expect(uploadFileName(sent, 'x')).toEqual({ ok: true, value: 'gnp.zip' });
  });

  it('RF-128 strips a right-to-left override from the project name used as the fallback', () => {
    expect(uploadFileName(undefined, 'Order‮Desk')).toEqual({
      ok: true,
      value: 'OrderDesk.zip',
    });
  });

  it('RF-128 refuses a name that is only bidi controls before .zip', () => {
    expect(uploadFileName(encodeURIComponent('‮.zip'), 'x')).toEqual({
      ok: false,
      error: 'not-a-zip-name',
    });
  });

  it('RF-128 drops a whole emoji that straddles the 200-character cut', () => {
    const emoji = '\u{1F600}';
    const result = uploadFileName(encodeURIComponent(`${'a'.repeat(195)}${emoji}bbbb.zip`), 'x');

    expect(result).toEqual({ ok: true, value: `${'a'.repeat(195)}.zip` });
  });

  it('RF-128 keeps a whole emoji that ends exactly at the cut', () => {
    const emoji = '\u{1F600}';
    const result = uploadFileName(encodeURIComponent(`${'a'.repeat(194)}${emoji}bbbb.zip`), 'x');

    expect(result).toEqual({ ok: true, value: `${'a'.repeat(194)}${emoji}.zip` });
  });
});
