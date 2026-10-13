import { describe, expect, it } from 'vitest';
import {
  anyFilter,
  type CallFilters,
  filterCalls,
  nextProblemSeq,
  optionsOf,
} from '../../../web/src/lib/api-calls/call-filter.js';
import { visibleLogs } from '../../../web/src/lib/api-calls/log-filter.js';
import { cloud, local, sampleCalls, sampleLogs } from './api-calls-fixtures.js';

// RF-1011 (P1-37): the filters of the "API calls" panel and the level filter of the "Logs" panel are
// plain functions of what the server sent.

const seqs = (rows: readonly { readonly seq: number }[]): number[] => rows.map((row) => row.seq);

describe('filterCalls', () => {
  it('RF-1011 keeps every call when no filter is set', () => {
    expect(seqs(filterCalls(sampleCalls, anyFilter))).toEqual([1, 2, 3, 4, 5]);
  });

  it('RF-1011 filters by provider, role and agent', () => {
    expect(seqs(filterCalls(sampleCalls, { ...anyFilter, provider: 'cloud' }))).toEqual([3, 4, 5]);
    expect(seqs(filterCalls(sampleCalls, { ...anyFilter, role: 'reader' }))).toEqual([1, 2]);
    expect(seqs(filterCalls(sampleCalls, { ...anyFilter, agent: 'Services' }))).toEqual([2, 5]);
  });

  it('RF-1011 filters by status: one status, or errors and retries together', () => {
    expect(seqs(filterCalls(sampleCalls, { ...anyFilter, status: 'retried' }))).toEqual([3]);
    expect(seqs(filterCalls(sampleCalls, { ...anyFilter, status: 'failed' }))).toEqual([5]);
    expect(seqs(filterCalls(sampleCalls, { ...anyFilter, status: 'ok' }))).toEqual([1, 2, 4]);
    expect(seqs(filterCalls(sampleCalls, { ...anyFilter, status: 'problems' }))).toEqual([3, 5]);
  });

  it('RF-1011 combines the filters', () => {
    const filters: CallFilters = {
      provider: 'cloud',
      role: 'verifier',
      agent: 'Services',
      status: 'ok',
    };

    expect(seqs(filterCalls(sampleCalls, filters))).toEqual([]);
    expect(seqs(filterCalls(sampleCalls, { ...filters, status: 'failed' }))).toEqual([5]);
  });
});

describe('optionsOf', () => {
  it('RF-1011 lists the providers, roles and agents of the calls once each, sorted', () => {
    expect(optionsOf([...sampleCalls, local(6)])).toEqual({
      providers: ['cloud', 'local'],
      roles: ['reader', 'verifier'],
      agents: ['Catalog', 'Services'],
    });
  });
});

describe('nextProblemSeq', () => {
  const problems = [
    local(1),
    cloud(2, { status: 'retried' }),
    local(3),
    cloud(4, { status: 'failed' }),
  ];

  it('RF-1011 finds the first error or retry when nothing is selected', () => {
    expect(nextProblemSeq(problems, undefined)).toBe(2);
  });

  it('RF-1011 finds the next one after the selected call', () => {
    expect(nextProblemSeq(problems, 2)).toBe(4);
    expect(nextProblemSeq(problems, 1)).toBe(2);
  });

  it('RF-1011 starts again from the first after the last one', () => {
    expect(nextProblemSeq(problems, 4)).toBe(2);
  });

  it('RF-1011 finds none when every call was answered', () => {
    expect(nextProblemSeq([local(1), local(2)], undefined)).toBeUndefined();
  });

  it('RF-1011 counts a call refused by the cap as a problem', () => {
    expect(nextProblemSeq([local(1), cloud(2, { status: 'refused-by-cap' })], undefined)).toBe(2);
  });
});

describe('visibleLogs', () => {
  const all = { debug: true, info: true, warn: true, error: true };

  it('RF-1011 shows the entries of the levels that are on', () => {
    const levels = { ...all, debug: false };

    expect(visibleLogs(sampleLogs, levels, false).map((entry) => entry.level)).toEqual([
      'info',
      'warn',
      'warn',
      'error',
    ]);
    expect(
      visibleLogs(sampleLogs, { debug: false, info: false, warn: false, error: true }, false),
    ).toHaveLength(1);
  });

  it('RF-1011 shows only the security events when asked, whatever the levels', () => {
    const shown = visibleLogs(sampleLogs, { ...all, warn: false }, true);

    expect(shown.map((entry) => entry.logger)).toEqual(['security']);
  });
});
