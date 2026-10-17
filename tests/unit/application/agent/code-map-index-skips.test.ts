import { describe, expect, it } from 'vitest';
import { CodeMapIndex } from '../../../../src/application/agent/code-map-index.js';
import { agentCodeMap } from '../../../support/agent-fixtures.js';
import { entry, unhashed } from '../../../support/code-map-builders.js';

// RF-100, RF-145: which listed files the scan did not read, however the path is spelled.

describe('code map index: skipped files', () => {
  const index = new CodeMapIndex(agentCodeMap);

  it('RF-100 names the reason a listed binary file was skipped', () => {
    expect(index.skipReasonOf('src/Orders/logo.png')).toBe('binary');
  });

  it('RF-100 finds a skipped file written in another letter case', () => {
    expect(index.skipReasonOf('SRC/orders/LOGO.PNG')).toBe('binary');
  });

  it('RF-100 says nothing of a file the scan read or of a path it does not list', () => {
    expect(index.skipReasonOf('src/Orders/Order.cs')).toBeUndefined();
    expect(index.skipReasonOf('src/Orders/Missing.cs')).toBeUndefined();
  });

  it('RF-100 treats a path as skipped when any file that differs only in case was skipped', () => {
    const map = {
      ...agentCodeMap,
      files: [
        entry('data/Blob.cs', 5),
        unhashed('data/blob.CS', 0, { lines: 0, skipped: 'binary' }),
      ],
    };

    expect(new CodeMapIndex(map).skipReasonOf('data/BLOB.cs')).toBe('binary');
  });
});
