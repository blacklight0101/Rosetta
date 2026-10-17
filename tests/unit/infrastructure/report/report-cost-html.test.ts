import { describe, expect, it } from 'vitest';
import { REPORT_CSP } from '../../../../src/infrastructure/report/report-security.js';
import { renderCostHtml } from '../../../../src/infrastructure/report/site/cost-page.js';
import { auditHtml } from '../../../support/html-audit.js';
import { hostileText, plainCost, reportModel } from '../../../support/report-fixtures.js';

// RF-500, RF-426, RF-1010, RF-507, RF-1013: `cost.html`, the cost report of the run and the project
// totals at the time the report was generated.

type Overrides = Parameters<typeof reportModel>[0];

const pageOf = (overrides: Overrides = {}) => auditHtml(renderCostHtml(reportModel(overrides)));

const rowsOf = (page: ReturnType<typeof pageOf>, id: string): string[] =>
  [...page.document.querySelectorAll(`#${id} tbody tr`)].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent.trim()).join('|'),
  );

describe('the cost page', () => {
  it('RF-500 shows the totals of the run: cost, calls and every kind of token', () => {
    const page = pageOf();

    expect(page.document.querySelector('.headline')?.textContent).toBe(
      '$0.0040 in 3 calls (prices of 2026-10-01).',
    );
    const facts = [...page.document.querySelectorAll('.facts div')].map((fact) =>
      fact.textContent.replace(/\s+/gu, ' ').trim(),
    );
    expect(facts).toEqual([
      'Input tokens 3600',
      'Output tokens 330',
      'Cached input tokens 600',
      'Cache write tokens 120',
      'Cache write cost $0.0003',
    ]);
  });

  it('RF-500 breaks the cost down by role, provider and model', () => {
    const page = pageOf();

    expect(rowsOf(page, 'by-role')).toEqual([
      'reader|2|3000|300|600|$0.0030',
      'verifier|1|600|30|0|$0.0010',
    ]);
    expect(rowsOf(page, 'by-provider')).toEqual(['fake|3|3000|300|600|$0.0040']);
    expect(rowsOf(page, 'by-model')).toEqual(['fake model-a|3|3000|300|600|$0.0040']);
  });

  it('RF-427 says how many calls have no known cost', () => {
    const page = pageOf({
      cost: { ...plainCost, totals: { ...plainCost.totals, unpricedCalls: 2 } },
    });

    expect(page.document.querySelector('main')?.textContent).toContain(
      '2 calls have no known cost (the model has no price).',
    );
  });

  it('RF-1010 shows the project totals at the time the report was generated', () => {
    const page = pageOf();

    expect(page.document.querySelector('#project-totals .headline')?.textContent).toBe(
      'Project totals at 2026-10-12T11:00:00.000Z: $3.9900 in 12 calls, 1000000 tokens in, 310000 out.',
    );
  });
});

describe('the cost page without a cost report', () => {
  it('RF-500 falls back to the totals of the manifest when the run has no cost report', () => {
    const page = pageOf({ cost: null, documents: { spec: true, coverage: false, cost: false } });

    expect(page.document.querySelector('.headline')?.textContent).toBe(
      '$0.0040 in 3 calls, 3600 tokens in, 330 out.',
    );
    expect(page.document.querySelector('main')?.textContent).toContain(
      'The detailed cost report is not available for this run.',
    );
    expect(page.document.querySelectorAll('table')).toHaveLength(0);
  });

  it('RF-500 says there is no cost at all when the run has neither', () => {
    const page = pageOf({ cost: null, totals: null, projectTotals: null });

    expect(page.document.querySelector('main')?.textContent).toContain(
      'No cost was recorded for this run.',
    );
  });

  it('RF-500 links the cost report as Markdown only when the run has it', () => {
    const links = (page: ReturnType<typeof pageOf>) =>
      [...page.document.querySelectorAll('main a')].map((link) => link.getAttribute('href'));

    expect(links(pageOf())).toContain('../cost.md');
    expect(
      links(pageOf({ documents: { spec: true, coverage: false, cost: false } })),
    ).not.toContain('../cost.md');
  });
});

describe('the cost page as a site page', () => {
  it('RF-500 is a page of the report: current in the navigation, with the policy', () => {
    const page = pageOf();

    expect(page.document.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Cost');
    expect(page.csp).toBe(REPORT_CSP);
    expect(page.referrer).toBe('no-referrer');
  });

  it('RF-507 shows a hostile role or model name as text', () => {
    const line = { ...plainCost.totals, key: hostileText };
    const page = pageOf({ cost: { ...plainCost, byRole: [line] } });

    expect(page.scripts).toEqual([]);
    expect(page.handlers).toEqual([]);
    expect(
      page.document.querySelectorAll('#by-role img, #by-role script, #by-role a'),
    ).toHaveLength(0);
    expect(page.document.querySelector('#by-role tbody td')?.textContent).toBe(hostileText);
  });
});
