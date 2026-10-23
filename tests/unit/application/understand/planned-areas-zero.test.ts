import { describe, expect, it } from 'vitest';
import { plannedAreas } from '../../../../src/application/understand/planned-areas.js';
import type { Area } from '../../../../src/domain/code-map/area.js';

// P3-112 (EV-33): an area with no readable file is not offered or planned.

const area = (name: string, files: string[], estimatedTokens: number): Area => ({
  ...{ name, files, estimatedTokens, mapLevel: 'coarse', origin: 'folder' },
});

describe('plannedAreas without readable files', () => {
  it('P3-112 does not offer an area with no readable file (zero tokens)', () => {
    const planned = plannedAreas({
      codeMap: {
        areas: [area('Tools', ['Tools/Helper.cs'], 10), area('Images', ['Images/logo.png'], 0)],
      },
      source: { snapshotKey: 'upload__x@aaaaaaaaaaaaaaaa' },
    });

    expect(planned.map((each) => each.name)).toEqual(['Tools']);
  });
});
