import { describe, expect, it } from 'vitest';
import { isUploadSnapshotKey } from '../../../../src/domain/sources/upload-name.js';
import {
  isWorkbookSnapshotKey,
  workbookKeyPrefix,
  workbookSnapshotKey,
} from '../../../../src/domain/sources/workbook-key.js';
import { PROJECT_ID, UPLOAD_KEY, WORKBOOK_KEY } from '../../../support/workbook-source-fixtures.js';

// RF-152, RFC-005 section 4.1: the key of a workbook snapshot is
// `workbook__<project id>@<first 16 hex of the snapshot hash>`, beside the upload key.

const HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('workbook snapshot key', () => {
  it('RF-152 is workbook__<project id>@ and the first 16 hex of the hash', () => {
    expect(workbookSnapshotKey(PROJECT_ID, `sha256:${HEX}`)).toBe(WORKBOOK_KEY);
  });

  it('RF-152 reads a hash given without its sha256: prefix the same', () => {
    expect(workbookSnapshotKey(PROJECT_ID, HEX)).toBe(WORKBOOK_KEY);
  });

  it('RF-152 the prefix is the part every key of one project shares', () => {
    expect(workbookKeyPrefix(PROJECT_ID)).toBe(`workbook__${PROJECT_ID}@`);
    expect(WORKBOOK_KEY.startsWith(workbookKeyPrefix(PROJECT_ID))).toBe(true);
  });

  it('RF-152 accepts a key of that shape', () => {
    expect(isWorkbookSnapshotKey(WORKBOOK_KEY)).toBe(true);
  });

  it('RF-152 refuses a key with the upload prefix', () => {
    expect(isWorkbookSnapshotKey(UPLOAD_KEY)).toBe(false);
  });

  it('RF-130 the upload test still refuses a workbook key', () => {
    expect(isUploadSnapshotKey(WORKBOOK_KEY)).toBe(false);
  });

  it.each([
    ['a project id that is not a UUID', 'workbook__not-a-uuid@0123456789abcdef'],
    [
      'a short first group in the project id',
      'workbook__0000-0000-4000-a000-000000000001@0123456789abcdef',
    ],
    ['15 hex characters', `workbook__${PROJECT_ID}@0123456789abcde`],
    ['17 hex characters', `workbook__${PROJECT_ID}@0123456789abcdef0`],
    ['upper-case hex', `workbook__${PROJECT_ID}@0123456789ABCDEF`],
    ['a GitHub key', `octo__demo@${'ab'.repeat(20)}`],
    ['text before the prefix', `x${WORKBOOK_KEY}`],
    ['text after the hash', `${WORKBOOK_KEY}/..`],
  ])('RF-152 refuses a key with %s', (_what, key) => {
    expect(isWorkbookSnapshotKey(key)).toBe(false);
  });
});
