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

  it('RF-128 refuses a name that is not valid percent-encoding', () => {
    expect(uploadFileName('%E0%A4%A.zip', 'x')).toEqual({ ok: false, error: 'not-a-zip-name' });
  });
});
