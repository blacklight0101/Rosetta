import { describe, expect, it } from 'vitest';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { renderEvidencePages } from '../../../../src/infrastructure/report/site/evidence-pages.js';
import {
  areaPageName,
  cardPageName,
} from '../../../../src/infrastructure/report/site/page-names.js';
import { auditHtml } from '../../../support/html-audit.js';
import { plainCard, plainDetail, reportModel } from '../../../support/report-fixtures.js';

// RF-500, RF-502, RF-501: the pages of the areas and the cards of a run, by file name, and the
// dashboard that links them.

const ledger = { ...plainCard, id: 'ENT-001', type: 'ENT', area: 'LEDGER' };
const entity = { ...plainDetail, id: 'ENT-001', type: 'ENT', area: 'LEDGER' } as const;

const model = reportModel({
  cards: [plainCard, ledger],
  areas: [{ name: 'orders', mapLevel: 'symbols' }],
  cardDetails: [plainDetail, entity],
  coverage: {
    filesListed: 1,
    filesRead: 1,
    readTokenShare: 1,
    areas: [{ area: 'catalog', filesListed: 1, filesRead: 1, readTokenShare: 1 }],
  },
});

describe('renderEvidencePages', () => {
  it('RF-500 makes a page for every area (of the code map, the coverage and the cards) and every card with a detail', () => {
    const names = Object.keys(renderEvidencePages(model));

    expect(names).toEqual(
      [
        areaPageName('LEDGER'),
        areaPageName('catalog'),
        areaPageName('orders'),
        cardPageName('BR-001'),
        cardPageName('ENT-001'),
      ].sort(),
    );
  });

  it('RF-500 makes no card page for a card without a detail, and no page for a run without cards or areas', () => {
    const noDetail = reportModel({ cards: [plainCard], cardDetails: [] });
    const nothing = reportModel({ cards: [], areas: [], coverage: null, cardDetails: [] });

    expect(Object.keys(renderEvidencePages(noDetail))).toEqual([areaPageName('orders')]);
    expect(renderEvidencePages(nothing)).toEqual({});
  });

  it('RF-500 writes each page as a whole document with the policy of RF-1013', () => {
    for (const html of Object.values(renderEvidencePages(model))) {
      const page = auditHtml(html);

      expect(page.csp).toContain("default-src 'self'");
      expect(page.document.querySelector('main h1')).not.toBeNull();
    }
  });

  it('RF-500 gives the same pages for the same model', () => {
    expect(renderEvidencePages(model)).toEqual(renderEvidencePages(model));
  });

  it('RF-502 shows the evidence on the page of the card', () => {
    const html = renderEvidencePages(model)[cardPageName('BR-001')] ?? '';

    expect(html).toContain('Gift orders also ship free.');
  });
});

describe('the dashboard and the pages', () => {
  const dashboard = auditHtml(renderReportHtml(model));
  const hrefsOf = (selector: string): (string | null)[] =>
    [...dashboard.document.querySelectorAll(selector)].map((a) => a.getAttribute('href'));

  it('RF-500 links each card to its page when it has one', () => {
    expect(hrefsOf('section[aria-labelledby="cards"] tbody tr a[href^="card-"]')).toEqual([
      cardPageName('BR-001'),
      cardPageName('ENT-001'),
    ]);
  });

  it('RF-500 links a card without a page to its card file, as before', () => {
    const page = auditHtml(renderReportHtml(reportModel({ cards: [plainCard], cardDetails: [] })));

    expect(
      page.document.querySelector('section[aria-labelledby="cards"] tbody a')?.getAttribute('href'),
    ).toBe('../cards/BR/BR-001.md');
  });

  it('RF-500 links each area of the code map and of the cards to its page', () => {
    expect(hrefsOf('section[aria-labelledby="areas"] tbody a')).toEqual([areaPageName('orders')]);
    expect(hrefsOf('section[aria-labelledby="cards"] tbody td[data-label="Area"] a')).toEqual([
      areaPageName('orders'),
      areaPageName('LEDGER'),
    ]);
  });
});
