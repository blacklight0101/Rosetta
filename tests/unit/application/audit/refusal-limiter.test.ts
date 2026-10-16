import { describe, expect, it } from 'vitest';
import {
  REFUSAL_LIMITS,
  RefusalLimiter,
} from '../../../../src/application/audit/refusal-limiter.js';

// RF-1109, DEC-141: up to 30 refusal rows a minute per client address; the refusals past that are
// counted, and the count is handed back once the address's minute has ended. The limiter keeps at
// most `maxAddresses` addresses, so a flood of distinct addresses cannot grow it without bound.

const MINUTE = 60_000;
const start = Date.parse('2026-10-16T09:00:00.000Z');

function admitMany(limiter: RefusalLimiter, ip: string, times: number, at = start): boolean[] {
  return Array.from({ length: times }, () => limiter.admit(ip, at).write);
}

describe('RefusalLimiter', () => {
  it('RF-1109 keeps the documented limits: 30 rows a minute and 10,000 addresses', () => {
    expect(REFUSAL_LIMITS).toEqual({ rowsPerWindow: 30, windowMs: MINUTE, maxAddresses: 10_000 });
  });

  it('RF-1109 admits 30 refusals of one address in a minute and counts the rest', () => {
    const limiter = new RefusalLimiter();

    const writes = admitMany(limiter, '203.0.113.1', 1_000);

    expect(writes.filter(Boolean)).toHaveLength(30);
    expect(writes.slice(0, 30).every(Boolean)).toBe(true);
    expect(limiter.takeEnded(start + MINUTE)).toEqual([
      { ip: '203.0.113.1', windowStartMs: start, count: 970 },
    ]);
  });

  it('RF-1109 hands the count back only once the minute has ended', () => {
    const limiter = new RefusalLimiter();
    admitMany(limiter, '203.0.113.1', 40);

    const early = limiter.takeEnded(start + MINUTE - 1);
    const ended = limiter.takeEnded(start + MINUTE);
    const again = limiter.takeEnded(start + 2 * MINUTE);

    expect(early).toEqual([]);
    expect(ended).toEqual([{ ip: '203.0.113.1', windowStartMs: start, count: 10 }]);
    expect(again).toEqual([]);
  });

  it('RF-1109 a minute without refusals past the limit hands back no count', () => {
    const limiter = new RefusalLimiter();
    admitMany(limiter, '203.0.113.1', 30);

    expect(limiter.takeEnded(start + MINUTE)).toEqual([]);
    expect(limiter.size).toBe(0);
  });
});

describe('RefusalLimiter addresses', () => {
  it('RF-1109 gives two addresses 30 rows each', () => {
    const limiter = new RefusalLimiter();

    const first = admitMany(limiter, '203.0.113.1', 50);
    const second = admitMany(limiter, '203.0.113.2', 50);

    expect(first.filter(Boolean)).toHaveLength(30);
    expect(second.filter(Boolean)).toHaveLength(30);
  });

  it('RF-1109 starts a new minute for an address whose minute has ended', () => {
    const limiter = new RefusalLimiter();
    admitMany(limiter, '203.0.113.1', 35);

    const next = limiter.admit('203.0.113.1', start + MINUTE);
    const writes = admitMany(limiter, '203.0.113.1', 40, start + MINUTE);

    expect(next.write).toBe(true);
    expect(next.ended).toEqual([{ ip: '203.0.113.1', windowStartMs: start, count: 5 }]);
    expect(writes.filter(Boolean)).toHaveLength(29);
  });

  it('RF-1109 the next refusal of any address hands back the counts of ended minutes', () => {
    const limiter = new RefusalLimiter();
    admitMany(limiter, '203.0.113.1', 31);

    const other = limiter.admit('198.51.100.9', start + MINUTE + 5);

    expect(other).toEqual({
      write: true,
      ended: [{ ip: '203.0.113.1', windowStartMs: start, count: 1 }],
    });
  });

  it('RF-1109 an address seen again before its minute ends stays in the same minute', () => {
    const limiter = new RefusalLimiter();
    admitMany(limiter, '203.0.113.1', 30);

    const late = limiter.admit('203.0.113.1', start + MINUTE - 1);

    expect(late).toEqual({ write: false, ended: [] });
  });
});

describe('RefusalLimiter memory', () => {
  it('RF-1109 100,000 distinct addresses keep at most maxAddresses entries', () => {
    const limiter = new RefusalLimiter();

    for (let index = 0; index < 100_000; index += 1) {
      limiter.admit(
        `10.${String(index >> 16)}.${String((index >> 8) & 255)}.${String(index & 255)}`,
        start,
      );
    }

    expect(limiter.size).toBe(REFUSAL_LIMITS.maxAddresses);
  });

  it('RF-1109 an address pushed out for room hands back its count at once', () => {
    const limiter = new RefusalLimiter({ ...REFUSAL_LIMITS, rowsPerWindow: 1, maxAddresses: 2 });
    admitMany(limiter, '203.0.113.1', 4);
    admitMany(limiter, '203.0.113.2', 1);

    const third = limiter.admit('203.0.113.3', start + 10);

    expect(third).toEqual({
      write: true,
      ended: [{ ip: '203.0.113.1', windowStartMs: start, count: 3 }],
    });
    expect(limiter.size).toBe(2);
  });
});

describe('RefusalLimiter and a clock that went back', () => {
  it('RF-1109 a clock that went back does not hide an ended minute behind a newer one', () => {
    const limiter = new RefusalLimiter();
    admitMany(limiter, '203.0.113.1', 31, start + 30_000);
    admitMany(limiter, '203.0.113.2', 31, start);

    const ended = limiter.takeEnded(start + MINUTE);

    expect(ended).toEqual([{ ip: '203.0.113.2', windowStartMs: start, count: 1 }]);
    expect(limiter.size).toBe(1);
  });

  it('RF-1109 a clock that went back still starts a new minute for an ended address', () => {
    const limiter = new RefusalLimiter();
    admitMany(limiter, '203.0.113.1', 1, start + 30_000);
    admitMany(limiter, '203.0.113.2', 31, start);

    const next = limiter.admit('203.0.113.2', start + MINUTE);

    expect(next).toEqual({
      write: true,
      ended: [{ ip: '203.0.113.2', windowStartMs: start, count: 1 }],
    });
  });

  it('RF-1109 takeAll hands back every pending count, ended or not, and empties the limiter', () => {
    const limiter = new RefusalLimiter();
    admitMany(limiter, '203.0.113.1', 32);
    admitMany(limiter, '203.0.113.2', 3);

    const all = limiter.takeAll();

    expect(all).toEqual([{ ip: '203.0.113.1', windowStartMs: start, count: 2 }]);
    expect(limiter.size).toBe(0);
  });
});
