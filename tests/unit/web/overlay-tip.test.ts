import { describe, expect, it } from 'vitest';
import { tipPlace } from '../../../web/src/components/overlay-tip.js';

// RNF-010, design-system.md section 5.1, P8-89: where the overlay tooltip stands beside its trigger.

const view = { width: 1280, height: 800 };
const size = { width: 400, height: 40 };

describe('the place of an overlay tooltip', () => {
  it('RNF-010 stands under its trigger, at its left edge, when there is room', () => {
    const anchor = { left: 600, top: 300, bottom: 320 };

    expect(tipPlace(anchor, size, view)).toEqual({ left: 600, top: 324 });
  });

  it('RNF-010 stands above its trigger when there is no room under it', () => {
    const anchor = { left: 600, top: 770, bottom: 790 };

    expect(tipPlace(anchor, size, view)).toEqual({ left: 600, top: 726 });
  });

  it('RNF-010 never passes the right edge of the viewport', () => {
    const anchor = { left: 1100, top: 300, bottom: 320 };

    expect(tipPlace(anchor, size, view)).toEqual({ left: 872, top: 324 });
  });

  it('RNF-010 never passes the left edge, even when it is as wide as a phone', () => {
    const anchor = { left: 20, top: 300, bottom: 320 };
    const phone = { width: 360, height: 780 };

    expect(tipPlace(anchor, { width: 400, height: 90 }, phone).left).toBe(8);
  });

  it('RNF-010 stays under the trigger when neither side has room, inside the viewport', () => {
    const anchor = { left: 100, top: 30, bottom: 50 };
    const short = { width: 1280, height: 90 };

    expect(tipPlace(anchor, size, short)).toEqual({ left: 100, top: 42 });
  });
});
