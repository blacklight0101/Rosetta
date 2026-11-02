import { describe, expect, it } from 'vitest';
import { keysOf, at, stepScript } from '../../support/workflow-yaml.js';
import {
  dispatched,
  run,
  scheduled,
  sha,
  trackedGh,
} from '../../support/scheduled-release-step.js';

// P8-13 (follow-up of P7-28), ADR-025, DEC-175: the Madrid boundaries of scheduled-release.yml and the
// double dispatch of two delayed slots. The step runs against a fake gh and date; nothing reaches GitHub.

// P8-13: the hour and the day come from one date call, and the 06:00 and 07:59 edges hold on a summer
// day, a winter day and the two DST change days of 2026 (29 March and 25 October).
const days = {
  summer: { day: '2026-07-15', offset: 2 },
  winter: { day: '2026-01-15', offset: 1 },
  'spring DST change': { day: '2026-03-29', offset: 2 },
  'autumn DST change': { day: '2026-10-25', offset: 1 },
} as const;
const utc = (day: string, madrid: string, offset: number): string => {
  const [h = 0, m = 0] = madrid.split(':').map(Number);
  return new Date(Date.parse(`${day}T00:00:00Z`) + ((h - offset) * 60 + m) * 60_000).toISOString();
};
const cases = Object.entries(days).flatMap(([name, { day, offset }]) =>
  (
    [
      ['05:59', false],
      ['06:00', true],
      ['07:59', true],
    ] as const
  ).map(([time, starts]) => ({ name, time, starts, now: utc(day, time, offset) })),
);

describe('scheduled-release.yml Madrid boundaries', () => {
  it.each(cases)(
    'P8-13 on a $name day a scheduled run at $time Madrid starts Release: $starts',
    async ({ now, starts, time }) => {
      const result = await run({ now, slot: '7 5 * * *' });

      expect(result.code).toBe(0);
      expect(dispatched(result.calls)).toBe(starts);
      expect(result.summary).toContain(
        starts ? `Madrid hour ${time.slice(0, 2)}` : 'before the 06:07',
      );
    },
  );
});

describe('scheduled-release.yml Madrid cut-off', () => {
  it.each(Object.entries(days))(
    'P8-13 on a %s day a late slot checks the merge time against 06:00 Madrid of that day',
    async (_name, { day, offset }) => {
      const now = utc(day, '12:00', offset);
      const before = await run({ now, committed: utc(day, '05:59', offset) });
      const after = await run({ now, committed: utc(day, '06:00', offset) });

      expect(dispatched(before.calls)).toBe(true);
      expect(dispatched(after.calls)).toBe(false);
    },
  );

  it('P8-13 08:00 Madrid is the first late minute and takes the late path', async () => {
    const now = utc('2026-07-15', '08:00', 2);
    const result = await run({ now, committed: utc('2026-07-15', '03:00', 2) });

    expect(dispatched(result.calls)).toBe(true);
    expect(result.calls).toContain(
      `api repos/blacklight0101/Rosetta/commits/${sha} --jq .commit.committer.date`,
    );
  });

  it('P8-13 one date call gives both the Madrid hour and the Madrid day', async () => {
    const document = await scheduled();
    const [job = ''] = keysOf(at(document, 'jobs'));
    const script = stepScript(document, job, 'Release');
    const madridDates = script.split('\n').filter((line) => line.includes('TZ=Europe/Madrid date'));

    expect(madridDates.filter((line) => !line.includes(' -d '))).toHaveLength(1);
    expect(script).toContain('%F %H');
    expect(script).not.toMatch(/today="\$\(TZ=Europe\/Madrid date \+%F\)"/u);
  });
});

// P8-13: slots queued in one concurrency group run one after the other, but GitHub may list the run a
// slot dispatched only seconds later. The slot waits until its run is listed, so the next slot sees it.
describe('scheduled-release.yml two simultaneous delayed slots', () => {
  const starts = (calls: string[]): number =>
    calls.filter((call) => call === 'workflow run release.yml --ref main').length;

  it('P8-13 two delayed slots start Release once even when GitHub lists the run late', async () => {
    const shared = await trackedGh({ hour: '13', listLag: 2 });
    const first = await run({ shared, slot: '7 5 * * *' });
    const second = await run({ shared, slot: '37 5 * * *' });

    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(starts(second.calls)).toBe(1);
    expect(second.summary).toContain('a Release run of it is queued, running or succeeded');
  });

  it('P8-13 the slot lists the runs again after dispatching, until its own run shows', async () => {
    const shared = await trackedGh({ hour: '13', listLag: 2 });
    const { calls } = await run({ shared });
    const after = calls.slice(calls.indexOf('workflow run release.yml --ref main') + 1);

    expect(after.filter((call) => call.startsWith('run list'))).toHaveLength(3);
  });

  it('P8-13 a run that never shows up does not fail the slot, which says so in the summary', async () => {
    const shared = await trackedGh({ hour: '13', listLag: 1000 });
    const result = await run({ shared });

    expect(result.code).toBe(0);
    expect(starts(result.calls)).toBe(1);
    expect(result.summary).toContain('not listed');
  });
});
