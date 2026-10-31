import { describe, expect, it } from 'vitest';
import { canDeepen } from '../../../../src/domain/deepen/deepen-record.js';

// P7-02, RF-209, DEC-194: a Deepen starts from a Completed run and from a CapReached one that left
// planned areas unread ("Partly read"); a CapReached run that read every area is resumed, not deepened.

describe('canDeepen', () => {
  it('P7-02 accepts a CapReached understand run with unread areas', () => {
    expect(canDeepen({ stage: 'understand', endState: 'CapReached', unreadAreas: 4 })).toBe(true);
  });

  it('P7-02 refuses a CapReached understand run that read every area', () => {
    expect(canDeepen({ stage: 'understand', endState: 'CapReached', unreadAreas: 0 })).toBe(false);
  });

  it('RF-209 still accepts a Completed understand run and refuses other stages', () => {
    expect(canDeepen({ stage: 'understand', endState: 'Completed', unreadAreas: 0 })).toBe(true);
    expect(canDeepen({ stage: 'scan', endState: 'Completed', unreadAreas: 0 })).toBe(false);
  });
});
