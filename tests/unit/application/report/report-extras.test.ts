import { describe, expect, it } from 'vitest';
import { buildCostReport } from '../../../../src/application/budget/cost-report.js';
import {
  parseCostReport,
  parseCoverage,
  projectTotalsOf,
} from '../../../../src/application/report/report-extras.js';
import { costEntry, groupOf } from '../../../support/cost-fixtures.js';

// RF-500, RF-230, RF-426, RF-1010: the figures of the dashboard are read from the files and the
// ledger of the run; a file that is missing or torn gives none, never a failed report.

const area = (name: string, tokens: number, readTokens: number, read: boolean[]) => ({
  area: name,
  files: read.map((was, index) => ({
    path: `${name}/f${String(index)}.cs`,
    read: was ? [{ startLine: 1, endLine: 10 }] : [],
  })),
  tokens,
  readTokens,
  readTokenShare: tokens === 0 ? 0 : Math.round((readTokens / tokens) * 10_000) / 10_000,
});

const coverageText = (areas: readonly unknown[]): string =>
  JSON.stringify({ schemaVersion: 1, areas });

describe('parseCoverage', () => {
  it('RF-500 counts the files listed and read and the share of tokens read, per area and overall', () => {
    const coverage = parseCoverage(
      coverageText([
        area('orders', 100, 100, [true, true]),
        area('catalog', 300, 60, [true, false]),
      ]),
    );

    expect(coverage).toEqual({
      filesListed: 4,
      filesRead: 3,
      readTokenShare: 0.4,
      areas: [
        { area: 'orders', filesListed: 2, filesRead: 2, readTokenShare: 1 },
        { area: 'catalog', filesListed: 2, filesRead: 1, readTokenShare: 0.2 },
      ],
    });
  });

  it('RF-208 keeps the failure and the note of an area', () => {
    const failed = { ...area('billing', 50, 0, [false]), failure: 'invalid output (RST-1300)' };
    const noted = { ...area('docs', 50, 0, [false]), note: 'not read' };

    const areas = parseCoverage(coverageText([failed, noted]))?.areas;

    expect(areas?.[0]).toMatchObject({ area: 'billing', failure: 'invalid output (RST-1300)' });
    expect(areas?.[1]).toMatchObject({ area: 'docs', note: 'not read' });
  });

  it('RF-500 reads no tokens as a share of 0, not as a division by zero', () => {
    expect(parseCoverage(coverageText([area('empty', 0, 0, [])]))?.readTokenShare).toBe(0);
  });

  it.each([
    ['a missing file', undefined],
    ['a torn file', '{"schemaVersion": 1, "areas": ['],
    ['another version', JSON.stringify({ schemaVersion: 2, areas: [] })],
    ['a file that is not coverage', JSON.stringify({ hello: 'world' })],
  ])('RF-500 gives none for %s', (_name, text) => {
    expect(parseCoverage(text)).toBeNull();
  });
});

describe('parseCostReport', () => {
  const report = buildCostReport('20261012-100000-understand', [
    costEntry('u1', { role: 'reader', costMicros: 3000n }),
    costEntry('u1', { role: 'verifier', costMicros: 1000n, inputTokens: 200 }),
    costEntry('u1', { role: 'reader', model: 'gpt-5-mini', costMicros: 500n }),
  ]);

  it('RF-500 reads the totals and the lines of a cost.json as the run wrote it', () => {
    const cost = parseCostReport(JSON.stringify(report));

    expect(cost?.currency).toBe('USD');
    expect(cost?.priceTableVersion).toBe('2026-10-11');
    expect(cost?.totals).toMatchObject({ calls: 3, costMicros: 4500, inputTokens: 2200 });
    expect(cost?.byRole.map((line) => [line.key, line.calls, line.costMicros])).toEqual([
      ['reader', 2, 3500],
      ['verifier', 1, 1000],
    ]);
    expect(cost?.byProvider.map((line) => line.key)).toEqual(['openai']);
    expect(cost?.byModel.map((line) => line.key)).toEqual([
      'openai gpt-5-mini',
      'openai gpt-5-nano',
    ]);
  });

  it.each([
    ['a missing file', undefined],
    ['a torn file', '{"schemaVersion": 1'],
    ['another version', JSON.stringify({ ...report, schemaVersion: 2 })],
    ['a negative figure', JSON.stringify({ ...report, totals: { ...report.totals, calls: -1 } })],
  ])('RF-500 gives none for %s', (_name, text) => {
    expect(parseCostReport(text)).toBeNull();
  });
});

describe('projectTotalsOf', () => {
  it('RF-1010 adds the ledger groups of the project: tokens, calls, cost per currency, unknown cost', () => {
    const totals = projectTotalsOf([
      groupOf({
        calls: 2,
        inputTokens: 100,
        outputTokens: 10,
        cachedInputTokens: 5,
        costMicros: 700n,
      }),
      groupOf({ calls: 1, inputTokens: 50, costMicros: 300n, keySource: 'user' }),
      groupOf({ calls: 3, currency: 'EUR', costMicros: 100n }),
      groupOf({ calls: 4, costKnown: false, costMicros: 0n }),
    ]);

    expect(totals).toEqual({
      calls: 10,
      inputTokens: 2150,
      outputTokens: 310,
      cachedInputTokens: 155,
      cost: [
        { currency: 'EUR', costMicros: 100 },
        { currency: 'USD', costMicros: 1000 },
      ],
      unknownCostCalls: 4,
    });
  });

  it('RF-1010 gives zeros for a project without ledger rows', () => {
    expect(projectTotalsOf([])).toEqual({
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cost: [],
      unknownCostCalls: 0,
    });
  });
});
