/* eslint-disable n/no-missing-import -- the rule does not resolve .mjs; scripts/quarantine.d.mts declares the module */
import { describe, expect, it } from 'vitest';
// The list is read by plain JavaScript (scripts/run-e2e.mjs); scripts/quarantine.d.mts declares it.
import {
  isPlaywrightFile,
  isQuarantined,
  isVitestFile,
  playwrightTestList,
  quarantineProblems,
  type QuarantineEntry,
} from '../../../scripts/quarantine.mjs';

// P8-142 (DEC-227, RNF-005): tests/quarantine.json names each confirmed flaky test with an owner, an
// issue, a last day and the run that confirmed the flake. The required checks skip it; a separate job
// runs it; an expired or ownerless entry fails the guard.

const today = '2026-11-08';
const entry = {
  file: 'tests/e2e/live-run-controls.spec.ts',
  title: ['live run', 'RF-1002 stop a run'],
  owner: 'blacklight0101',
  issue: 1301,
  until: '2026-11-30',
  flakeRun: 'https://github.com/blacklight0101/Rosetta/actions/runs/123456789',
} as const;
const withEntry = (change: Record<string, unknown>): unknown[] => [{ ...entry, ...change }];

describe('quarantine list, the guard', () => {
  it('RNF-005 an entry with an owner, an issue, a flake run and a date not passed has no problem', () => {
    expect(quarantineProblems([entry], today)).toEqual([]);
    expect(quarantineProblems([{ ...entry, until: today }], today)).toEqual([]);
    expect(quarantineProblems([], today)).toEqual([]);
  });

  it('RNF-005 an entry past its date is a problem', () => {
    expect(quarantineProblems(withEntry({ until: '2026-11-07' }), today)).toEqual([
      'entry 0 (tests/e2e/live-run-controls.spec.ts › live run › RF-1002 stop a run): until 2026-11-07 has passed',
    ]);
  });

  it.each([
    ['owner', { owner: '' }, 'no owner'],
    ['owner', { owner: undefined }, 'no owner'],
    ['issue', { issue: undefined }, 'no issue'],
    ['issue', { issue: 0 }, 'no issue'],
    ['issue', { issue: '1301' }, 'no issue'],
    ['flake run', { flakeRun: undefined }, 'no flakeRun'],
    ['flake run', { flakeRun: 'https://example.com/runs/1' }, 'no flakeRun'],
  ])('RNF-005 an entry without a valid %s is a problem (%j)', (_field, change, problem) => {
    const problems = quarantineProblems(withEntry(change), today);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(problem);
  });

  it.each([
    [{ until: '30/11/2026' }, 'until'],
    [{ until: '2026-02-30' }, 'until'],
    [{ file: 'src/domain/x.ts' }, 'file'],
    [{ title: [] }, 'title'],
    [{ title: ['a › b'] }, 'title'],
    [{ title: ['two\nlines'] }, 'title'],
  ])('RNF-005 a malformed field is a problem (%j)', (change, field) => {
    const problems = quarantineProblems(withEntry(change), today);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(field);
  });

  it('RNF-005 a list that is not an array of entries is a problem', () => {
    expect(quarantineProblems({}, today)).toEqual(['the list must be a JSON array']);
    expect(quarantineProblems(['x'], today)[0]).toContain('entry 0');
  });
});

describe('quarantine list, matching a test', () => {
  const entries: QuarantineEntry[] = [entry];

  it('RNF-005 matches the file and the title path, or a describe block by its prefix', () => {
    expect(isQuarantined(entries, entry.file, [...entry.title])).toBe(true);
    expect(isQuarantined([{ ...entry, title: ['live run'] }], entry.file, [...entry.title])).toBe(
      true,
    );
  });

  it('RNF-005 does not match another file, another title or a shorter title path', () => {
    expect(isQuarantined(entries, 'tests/e2e/other.spec.ts', [...entry.title])).toBe(false);
    expect(isQuarantined(entries, entry.file, ['live run', 'RF-1003 resume'])).toBe(false);
    expect(isQuarantined(entries, entry.file, ['live run'])).toBe(false);
    expect(isQuarantined([], entry.file, [...entry.title])).toBe(false);
  });

  it('RNF-005 matches titles and file paths exactly, never by a substring', () => {
    const run = [{ ...entry, title: ['live run'] }];

    // "live run" is listed: a describe block named "live running" is another block.
    expect(isQuarantined(run, entry.file, ['live running', 'RF-1002 stop a run'])).toBe(false);
    expect(isQuarantined(run, entry.file, ['pre live run', 'RF-1002 stop a run'])).toBe(false);
    expect(isQuarantined(entries, entry.file, ['live run', 'RF-1002 stop a run twice'])).toBe(
      false,
    );
    // A longer path, a sibling path and a path with a prefix must not match the listed one.
    expect(isQuarantined(entries, `${entry.file}.bak`, [...entry.title])).toBe(false);
    expect(isQuarantined(entries, `x/${entry.file}`, [...entry.title])).toBe(false);
    expect(isQuarantined(entries, 'tests/e2e/live-run-controls.spec', [...entry.title])).toBe(
      false,
    );
    expect(isQuarantined(entries, 'tests/e2e/live-run-controls.spec.tsx', [...entry.title])).toBe(
      false,
    );
    // A listed describe block still quarantines every test inside it, however deep.
    expect(isQuarantined(run, entry.file, ['live run', 'nested', 'RF-1004 deep test'])).toBe(true);
  });

  it('RNF-005 tells Vitest test files from Playwright spec files', () => {
    expect(isVitestFile('tests/unit/domain/a.test.ts')).toBe(true);
    expect(isVitestFile('tests/unit/web/a.test.tsx')).toBe(true);
    expect(isVitestFile('tests/e2e/a.test.ts')).toBe(true);
    expect(isVitestFile('tests/e2e/a.spec.ts')).toBe(false);
    expect(isVitestFile('src/a.test.ts')).toBe(false);
    expect(isPlaywrightFile('tests/e2e/journeys/a.spec.ts')).toBe(true);
    expect(isPlaywrightFile('tests/compose/a.spec.ts')).toBe(false);
    expect(isPlaywrightFile('tests/e2e/support/a.ts')).toBe(false);
  });
});

describe('quarantine list, the Playwright test list', () => {
  it('RNF-005 lists the Playwright entries relative to tests/e2e, one per line, and leaves Vitest ones out', () => {
    const vitest = { ...entry, file: 'tests/unit/a.test.ts', title: ['a'] };

    expect(playwrightTestList([entry, vitest])).toBe(
      'live-run-controls.spec.ts › live run › RF-1002 stop a run\n',
    );
    expect(playwrightTestList([vitest])).toBe('');
  });
});
