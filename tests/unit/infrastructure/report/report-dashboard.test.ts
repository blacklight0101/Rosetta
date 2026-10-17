import { describe, expect, it } from 'vitest';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { auditHtml } from '../../../support/html-audit.js';
import {
  hostileText,
  plainCard,
  plainCoverage,
  reportModel,
} from '../../../support/report-fixtures.js';

// RF-500, RF-1010, RF-1013, RF-507, DEC-44, DEC-52: the dashboard, `report.html`: the cards by type,
// the claims by status, the coverage, the cost of the run and the project totals at the time the
// report was generated, rendered from Preact components.

type Overrides = Parameters<typeof reportModel>[0];

function pageOf(overrides: Overrides = {}) {
  return auditHtml(renderReportHtml(reportModel(overrides)));
}

const textsOf = (page: ReturnType<typeof pageOf>, selector: string): string[] =>
  [...page.document.querySelectorAll(selector)].map((item) => item.textContent.trim());

const second = {
  ...plainCard,
  id: 'ENT-001',
  type: 'ENT',
  path: 'cards/ENT/ENT-001.md',
  claimCounts: { Proposed: 0, CitationInvalid: 1, Supported: 2, Rejected: 1, Unverified: 0 },
};

const firstArea = plainCoverage.areas[0] ?? {
  area: '',
  filesListed: 0,
  filesRead: 0,
  readTokenShare: 0,
};

describe('the dashboard cards by type', () => {
  it('RF-500 counts the cards of each type, types in order', () => {
    const page = pageOf({ cards: [second, plainCard, { ...plainCard, id: 'BR-003' }] });

    expect(textsOf(page, '#cards-by-type li')).toEqual(['BR: 2 cards', 'ENT: 1 card']);
  });

  it('RF-500 says so when the run has no cards', () => {
    const page = pageOf({ cards: [] });

    expect(textsOf(page, '#cards-by-type p')).toEqual(['No cards.']);
  });
});

describe('the dashboard claims by status', () => {
  it('RF-500 counts the claims of every card for every status, as text and a glyph', () => {
    const page = pageOf({ cards: [plainCard, second] });

    expect(textsOf(page, '#claims-by-status li')).toEqual([
      'Proposed: 0',
      'CitationInvalid: 1',
      'Supported: 3',
      'Rejected: 1',
      'Unverified: 0',
    ]);
    expect(
      page.document.querySelectorAll('#claims-by-status li svg[aria-hidden="true"]'),
    ).toHaveLength(5);
  });

  it('RF-500 draws the share of each status as a bar that a screen reader gets as text', () => {
    const page = pageOf({ cards: [plainCard, second] });
    const bar = page.document.querySelector('#claims-by-status svg[role="img"]');

    expect(bar?.getAttribute('aria-label')).toBe(
      '0 Proposed, 1 CitationInvalid, 3 Supported, 1 Rejected, 0 Unverified',
    );
    expect(page.inlineStyles).toBe(0);
  });
});

describe('the dashboard coverage', () => {
  it('RF-500 shows the files read and the share of tokens read, overall and per area', () => {
    const page = pageOf();

    expect(textsOf(page, '#coverage .headline')).toEqual([
      'Files read: 4 of 5. Tokens read: 81.0%.',
    ]);
    expect(textsOf(page, '#coverage tbody tr')).toEqual([
      'orders3 of 3100.0%',
      'catalog1 of 240.0%not read',
    ]);
  });

  it('RF-500 says there are no coverage figures when the run has none', () => {
    const page = pageOf({ coverage: null });

    expect(textsOf(page, '#coverage')[0]).toContain('No coverage figures for this run.');
    expect(page.document.querySelectorAll('#coverage table')).toHaveLength(0);
  });

  it('RF-500 shows an area that failed as text', () => {
    const area = { ...firstArea, area: 'billing', failure: 'invalid output (RST-1300)' };
    const page = pageOf({ coverage: { ...plainCoverage, areas: [area] } });

    expect(page.document.querySelector('#coverage')?.textContent).toContain(
      'invalid output (RST-1300)',
    );
  });
});

describe('the dashboard cost and project totals', () => {
  it('RF-500 shows the cost of the run and links the cost page', () => {
    const page = pageOf();

    expect(textsOf(page, '#cost .headline')).toEqual([
      '$0.0040 in 3 calls, 3600 tokens in, 330 out.',
    ]);
    expect(page.document.querySelector('#cost a')?.getAttribute('href')).toBe('cost.html');
  });

  it('RF-1010 shows the project totals at the time the report was generated', () => {
    const page = pageOf();

    expect(textsOf(page, '#project-totals .headline')).toEqual([
      'Project totals at 2026-10-12T11:00:00.000Z: $3.99 in 12 calls, 1000000 tokens in, 310000 out.',
    ]);
  });

  it('RF-1010 names the calls whose cost is unknown and every currency', () => {
    const page = pageOf({
      projectTotals: {
        calls: 3,
        inputTokens: 10,
        outputTokens: 5,
        cachedInputTokens: 0,
        cost: [
          { currency: 'EUR', costMicros: 500_000 },
          { currency: 'USD', costMicros: 1_000_000 },
        ],
        unknownCostCalls: 2,
      },
    });

    const totals = textsOf(page, '#project-totals')[0] ?? '';
    expect(totals).toContain('EUR 0.5000 and $1.00');
    expect(totals).toContain('2 calls have no known cost');
  });

  it('RF-1010 says the totals are not available when the report has none', () => {
    const page = pageOf({ projectTotals: null });

    expect(textsOf(page, '#project-totals')[0]).toContain('not available');
  });
});

describe('the dashboard as a site page', () => {
  it('RF-500 links the other pages of the report and marks the dashboard as the current one', () => {
    const page = pageOf();
    const nav = [...page.document.querySelectorAll('nav a')].map((link) => [
      link.textContent,
      link.getAttribute('href'),
    ]);

    expect(nav).toEqual([
      ['Dashboard', 'report.html'],
      ['Open questions', 'questions.html'],
      ['Run replay', 'replay.html'],
      ['Cost', 'cost.html'],
    ]);
    expect(page.document.querySelector('nav a[aria-current="page"]')?.textContent).toBe(
      'Dashboard',
    );
  });

  it('RF-1013 carries the policy in a meta element and loads only the stylesheet', () => {
    const page = pageOf();

    expect(page.csp).toContain("default-src 'self'");
    expect(page.referrer).toBe('no-referrer');
    expect(page.scripts).toEqual([]);
    expect(page.styleElements).toBe(0);
  });

  it('RF-507 shows hostile text from coverage notes and area names as text', () => {
    const area = { ...firstArea, area: hostileText, note: hostileText };
    const page = pageOf({ coverage: { ...plainCoverage, areas: [area] } });

    expect(page.handlers).toEqual([]);
    expect(page.foreignLinks).toEqual([]);
    expect(
      page.document.querySelectorAll('#coverage script, #coverage img, #coverage a'),
    ).toHaveLength(0);
    expect(page.document.querySelector('#coverage tbody td')?.textContent).toBe(hostileText);
  });
});
