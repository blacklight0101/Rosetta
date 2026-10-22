import { expect, it } from 'vitest';
import { estimateSchema } from '../../../web/src/api/estimate-schemas.js';
import type { SpendLimits } from '../../../web/src/api/limits-schemas.js';
import { capWarnings } from '../../../web/src/lib/cap-warnings.js';
import { cloudEstimate, localEstimate, ownKeyEstimate } from './start-run-fixtures.js';

// RF-1001, RF-1106, DEC-107, DEC-108 (P1-106): the warnings of the start page compare the likely
// estimate with what is left of each cap that applies to the keys it uses, and name the amount that
// is left. Start stays available in every case; an unknown limit (null) makes no warning.

const server = estimateSchema.parse(cloudEstimate);
const own = estimateSchema.parse(ownKeyEstimate);
const local = estimateSchema.parse(localEstimate);
const runCapMicros = 2_000_000n;

function limits(parts: {
  readonly dayLeft?: bigint;
  readonly monthLeft?: bigint;
  readonly ownDayLeft?: bigint | null;
}): SpendLimits {
  const { dayLeft = 1_000_000n, monthLeft = 10_000_000n, ownDayLeft = null } = parts;
  return {
    serverKeys: {
      userDay: {
        capMicros: 1_000_000n,
        spentMicros: 1_000_000n - dayLeft,
        remainingMicros: dayLeft,
      },
      serverMonth: { remainingMicros: monthLeft },
      runCapMicros: 500_000n,
    },
    ownKeys: {
      day:
        ownDayLeft === null
          ? null
          : {
              capMicros: 1_500_000n,
              spentMicros: 1_500_000n - ownDayLeft,
              remainingMicros: ownDayLeft,
            },
    },
  };
}

const idsOf = (inputs: Parameters<typeof capWarnings>[0]): string[] =>
  capWarnings(inputs).map((warning) => warning.id);

it('RF-1001 an estimate within every remaining cap makes no warning', () => {
  expect(idsOf({ estimate: server, runCapMicros, limits: limits({}) })).toEqual([]);
});

it('RF-1001 a likely server-key cost above what is left of the user day warns and names what is left', () => {
  const [warning, ...rest] = capWarnings({
    estimate: server,
    runCapMicros,
    limits: limits({ dayLeft: 200_000n }),
  });

  expect(rest).toEqual([]);
  expect(warning?.id).toBe('user-day');
  expect(warning?.text).toContain('$0.20 left');
  expect(warning?.text).toContain('$0.19');
  expect(warning?.text).toContain('Start stays available');
});

it('RF-1106 a likely server-key cost above what is left of the server month warns', () => {
  const [warning] = capWarnings({
    estimate: server,
    runCapMicros,
    limits: limits({ monthLeft: 100_000n }),
  });

  expect(warning?.id).toBe('server-month');
  expect(warning?.text).toContain('$0.10 left');
});

it('DEC-107 a likely cost on the own key above what is left of the own daily cap warns', () => {
  const [warning] = capWarnings({
    estimate: own,
    runCapMicros,
    limits: limits({ ownDayLeft: 300_000n }),
  });

  expect(warning?.id).toBe('own-day');
  expect(warning?.text).toContain('$0.30 left');
  expect(warning?.text).toContain('$0.09');
});

it('RF-1106 the server caps do not apply to a run on the own key, and the own cap not to the server key', () => {
  expect(
    idsOf({ estimate: own, runCapMicros, limits: limits({ dayLeft: 0n, monthLeft: 0n }) }),
  ).toEqual([]);
  expect(idsOf({ estimate: server, runCapMicros, limits: limits({ ownDayLeft: 0n }) })).toEqual([]);
});

it('RF-1001 a local estimate costs nothing and warns of nothing, whatever is left', () => {
  const none = limits({ dayLeft: 0n, monthLeft: 0n, ownDayLeft: 0n });

  expect(idsOf({ estimate: local, runCapMicros: 0n, limits: none })).toEqual([]);
});

it('RF-1001 the run cap still warns, together with the caps that are short', () => {
  const ids = idsOf({
    estimate: server,
    runCapMicros: 250_000n,
    limits: limits({ dayLeft: 100_000n, monthLeft: 100_000n }),
  });

  expect(ids).toEqual(['run', 'user-day', 'server-month']);
});

it('RF-1001 limits that could not be read leave only the run cap to compare with', () => {
  expect(idsOf({ estimate: server, runCapMicros: 250_000n, limits: undefined })).toEqual(['run']);
});
