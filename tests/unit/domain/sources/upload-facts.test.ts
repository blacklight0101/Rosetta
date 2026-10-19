import { describe, expect, it } from 'vitest';
import { uploadSentence } from '../../../../src/domain/sources/upload-facts.js';

// RF-131: how a header names an uploaded zip in a sentence.

describe('uploadSentence', () => {
  it('RF-131 names the zip, the upload date and the snapshot hash', () => {
    expect(
      uploadSentence({
        fileName: 'OrderDesk.zip',
        uploadedAt: '2026-10-19T09:30:00.000Z',
        snapshotHash: 'sha256:ab',
      }),
    ).toBe(
      'the uploaded zip OrderDesk.zip (uploaded 2026-10-19T09:30:00.000Z, snapshot sha256:ab)',
    );
  });

  it('RF-131 names only the parts the manifest holds', () => {
    expect(uploadSentence({ fileName: 'a.zip', uploadedAt: null, snapshotHash: null })).toBe(
      'the uploaded zip a.zip',
    );
    expect(uploadSentence({ fileName: 'a.zip', uploadedAt: null, snapshotHash: 'sha256:ab' })).toBe(
      'the uploaded zip a.zip (snapshot sha256:ab)',
    );
  });

  it('RF-131 says when the name was not recorded', () => {
    expect(uploadSentence({ fileName: null, uploadedAt: null, snapshotHash: null })).toBe(
      'an uploaded zip (its name was not recorded)',
    );
    expect(uploadSentence({ fileName: null, uploadedAt: '2026-10-19', snapshotHash: null })).toBe(
      'an uploaded zip (its name was not recorded, uploaded 2026-10-19)',
    );
  });
});
