import { describe, expect, it } from 'vitest';
import {
  leavesOverviewRoom,
  OVERVIEW_SHARE_PERCENT,
} from '../../../../src/domain/budget/claim-room.js';

// RF-264, P7-26: the merges stop where the overview call still has its room in the run token cap.

const spent = (tokens: bigint) => ({ tokens, micros: 0n });

describe('leavesOverviewRoom', () => {
  it('RF-264 keeps 4% of the run token cap for the overview', () => {
    expect(OVERVIEW_SHARE_PERCENT).toBe(4);
  });

  it('RF-264 lets a merge start while the run has used 96% or less of its token cap', () => {
    expect(leavesOverviewRoom(spent(960_000n), 1_000_000n)).toBe(true);
  });

  it('RF-264 stops the merges once the run has used more than 96% of its token cap', () => {
    expect(leavesOverviewRoom(spent(960_001n), 1_000_000n)).toBe(false);
  });
});
