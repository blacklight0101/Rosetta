import { describe, expect, it } from 'vitest';
import { unreadPlannedAreas } from '../../../../src/application/deepen/deepen-state.js';
import { endText } from '../../../../web/src/lib/journey/journey-context.js';
import type { Area } from '../../../../src/domain/code-map/area.js';
import { entry } from '../../../support/code-map-builders.js';
import { coverageOf } from '../../../support/deepen-fixtures.js';

// P7-02, DEC-194: a Deepen that leaves planned areas without a coverage entry ends Partly read.

const files = [
  entry('src/a.cs', 100),
  entry('lib/b.cs', 50),
  entry('Scripts/jquery-3.4.1.js', 900),
];
const area = (name: string, paths: string[]): Area => ({
  ...{ name, files: paths, estimatedTokens: 100 },
  ...{ mapLevel: 'coarse', origin: 'folder' },
});
const areas = [
  area('src', ['src/a.cs']),
  area('lib', ['lib/b.cs']),
  area('Scripts', ['Scripts/jquery-3.4.1.js']),
];
const result = (area: string) => ({
  agentTaskId: 'reader-001',
  area,
  state: 'Done' as const,
  turns: 1,
  withoutCards: false,
  cards: [],
  coverage: coverageOf(area, []),
});

describe('unreadPlannedAreas', () => {
  it('P7-02 counts planned own-code areas with no coverage entry, not library areas', () => {
    const state = { results: [result('src')] };

    expect(unreadPlannedAreas(state, ['src', 'lib', 'Scripts'], { areas, files })).toBe(1);
  });

  it('P7-02 counts nothing for a run without a recorded plan', () => {
    expect(unreadPlannedAreas({ results: [] }, undefined, { areas, files })).toBe(0);
  });
});

describe('endText', () => {
  it('P7-02 says Partly read for a capped run with unread areas, else Stopped at its cap', () => {
    const run = { endState: 'CapReached', errorCode: 'RST-1600' } as const;

    expect(endText({ ...run, unreadAreas: 2 })).toBe('Partly read (RST-1600)');
    expect(endText({ ...run, unreadAreas: 0 })).toBe('Stopped at its cap (RST-1600)');
  });
});
