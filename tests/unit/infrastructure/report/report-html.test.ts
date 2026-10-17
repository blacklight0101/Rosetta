import { describe, expect, it } from 'vitest';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { REPORT_CSP } from '../../../../src/infrastructure/report/report-security.js';
import { auditHtml } from '../../../support/html-audit.js';
import { hostileCard, plainCard, reportModel } from '../../../support/report-fixtures.js';

// RF-504, RF-507, RF-1013, DEC-112: `report.html`, the report as static HTML in which every
// repository and model text is escaped, so `site/` never relies on a Markdown renderer.

function pageOf(overrides: Parameters<typeof reportModel>[0] = {}) {
  return auditHtml(renderReportHtml(reportModel(overrides)));
}

const hrefs = (page: ReturnType<typeof pageOf>): (string | null)[] =>
  [...page.document.querySelectorAll('a')].map((link) => link.getAttribute('href'));

describe('renderReportHtml page', () => {
  it('RF-1013 carries the content security policy in a meta element and the no-referrer policy', () => {
    const page = pageOf();

    expect(page.csp).toBe(REPORT_CSP);
    expect(page.referrer).toBe('no-referrer');
    expect(page.document.querySelector('meta[charset]')?.getAttribute('charset')).toBe('utf-8');
    expect(page.document.documentElement.getAttribute('lang')).toBe('en');
  });

  it('RF-1013 puts the policy before anything that loads', () => {
    const html = renderReportHtml(reportModel());

    expect(html.indexOf('Content-Security-Policy')).toBeGreaterThan(-1);
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<link'));
    expect(html.startsWith('<!doctype html>')).toBe(true);
  });

  it('RF-507 runs nothing: no script, no handler, no inline style, no foreign address', () => {
    const page = pageOf({ cards: [hostileCard] });

    expect(page.scripts).toEqual([]);
    expect(page.handlers).toEqual([]);
    expect(page.inlineStyles).toBe(0);
    expect(page.styleElements).toBe(0);
    expect(page.foreignLinks).toEqual([]);
  });

  it('RF-504 shows the run, its state and its cost', () => {
    const text = pageOf().document.body.textContent;

    expect(text).toContain('20261012-100000-understand');
    expect(text).toContain('Completed');
    expect(text).toContain('$0.0040');
    expect(text).toContain('understand');
  });
});

describe('renderReportHtml contents', () => {
  it('RF-504 links the specification, every card, the cost report and the replay', () => {
    const second = { ...plainCard, id: 'BR-002', path: 'cards/BR/BR-002.md' };
    const page = pageOf({ cards: [plainCard, second] });

    expect(hrefs(page)).toEqual(
      expect.arrayContaining([
        '../spec.md',
        '../cost.md',
        'replay.html',
        '../cards/BR/BR-001.md',
        '../cards/BR/BR-002.md',
      ]),
    );
  });

  it('RF-504 says that the coverage report does not exist instead of linking it', () => {
    const page = pageOf();

    expect(hrefs(page)).not.toContain('../coverage.md');
    expect(page.document.body.textContent).toContain('Coverage: not available for this run');
    expect(hrefs(pageOf({ documents: { spec: true, coverage: true, cost: true } }))).toContain(
      '../coverage.md',
    );
  });
});

describe('renderReportHtml cards', () => {
  it('RF-504 lists the cards in a table with their area and claims', () => {
    const cells = [...pageOf().document.querySelectorAll('table.cards tbody tr td')].map((cell) =>
      cell.textContent.trim(),
    );

    expect(cells).toEqual(['BR-001', 'BR', 'orders', '1 Supported', 'Free shipping over 50']);
  });

  it('RF-504 links to the source commit on GitHub and to the other report page', () => {
    const page = pageOf();

    expect(hrefs(page)).toContain(
      'https://github.com/octo/demo/tree/3f786850e387550fdab836ed7e6dc881de23001b',
    );
    expect(page.document.querySelector('nav a[aria-current="page"]')?.textContent).toBe(
      'Dashboard',
    );
    expect(hrefs(page)).toContain('replay.html');
  });

  it('RF-504 gives a run without cards a sentence instead of an empty table', () => {
    const page = pageOf({ cards: [], coverage: null });

    expect(page.document.querySelectorAll('table')).toHaveLength(0);
    expect(page.document.body.textContent).toContain('No cards.');
  });
});

describe('renderReportHtml and the map level', () => {
  it('RF-112 states the map level of every area, as text', () => {
    const page = pageOf({
      areas: [
        { name: 'LEDGER', mapLevel: 'coarse' },
        { name: '<b>orders</b>', mapLevel: 'symbols' },
      ],
    });
    const rows = [...page.document.querySelectorAll('section[aria-labelledby="areas"] tbody tr')];

    expect(rows.map((row) => row.textContent)).toEqual(['LEDGERcoarse', '<b>orders</b>symbols']);
    expect(page.document.querySelectorAll('b')).toHaveLength(0);
  });

  it('RF-112 leaves out the areas section when the report has no code map', () => {
    expect(pageOf({ areas: [] }).document.querySelector('#areas')).toBeNull();
  });
});

describe('renderReportHtml and untrusted text', () => {
  it('RF-507 shows the title of a hostile card as text, character for character', () => {
    const page = pageOf({ cards: [hostileCard] });
    const title = [...page.document.querySelectorAll('tbody td')].at(-1);

    expect(title?.textContent).toBe(hostileCard.title);
    expect(title?.children).toHaveLength(0);
    expect(page.document.querySelectorAll('img')).toHaveLength(0);
  });

  it('RF-507 gives a link in a title no anchor unless it goes to github.com', () => {
    const page = pageOf({
      cards: [{ ...plainCard, title: 'See [x](javascript:1) and [y](https://github.com/o/r)' }],
    });

    expect(hrefs(page)).not.toContain('javascript:1');
    expect(hrefs(page)).toContain('https://github.com/o/r');
  });
});
