import { describe, expect, it } from 'vitest';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { auditHtml } from '../../../support/html-audit.js';
import { filterCards, filterPage, filterRows } from '../../../support/report-filter-fixtures.js';
import { hostileText, reportModel } from '../../../support/report-fixtures.js';

// RF-503, RF-507, RNF-010: the markup of the card filters on the dashboard: labelled selects whose
// options come from the cards, rows that carry what the script filters on, and nothing that runs.

const texts = (page: ReturnType<typeof auditHtml>, selector: string): string[] =>
  [...page.document.querySelectorAll(selector)].map((item) => item.textContent.trim());

describe('the card filters markup', () => {
  it('RF-503 offers a labelled select for the type, the area and the status', () => {
    const page = filterPage();

    const labels = [...page.document.querySelectorAll('[data-card-filters] label')];
    expect(labels.map((label) => label.textContent)).toEqual(['Type', 'Area', 'Status']);
    for (const label of labels) {
      const select = page.document.getElementById(label.getAttribute('for') ?? 'missing');
      expect(select?.tagName).toBe('SELECT');
    }
  });
});

describe('the card filters options and rows', () => {
  it('RF-503 lists "All" first and then the types, areas and statuses the cards have, in order', () => {
    const page = filterPage();
    const options = (key: string): string[] => texts(page, `select[data-filter="${key}"] option`);

    expect(options('type')).toEqual(['All types', 'FEAT', 'BR', 'ENT']);
    expect(options('area')).toEqual(['All areas', 'catalog', 'orders']);
    expect(options('status')).toEqual(['All statuses', 'CitationInvalid', 'Supported', 'Rejected']);
    expect(
      [...page.document.querySelectorAll('select[data-filter] option')]
        .filter((option) => option.textContent.startsWith('All'))
        .map((option) => option.getAttribute('value')),
    ).toEqual(['', '', '']);
  });
});

describe('the card filters options and the rows', () => {
  it('RF-503 lists a type outside the vocabulary after the known ones instead of dropping its cards', () => {
    const odd = filterCards.map((card, index) => (index === 0 ? { ...card, type: 'ZED' } : card));
    const page = filterPage(odd);

    expect(texts(page, 'select[data-filter="type"] option')).toEqual([
      'All types',
      'BR',
      'ENT',
      'ZED',
    ]);
  });

  it('RF-503 puts on each row the type, the area and the statuses its claims have', () => {
    const page = filterPage();

    const rows = [...page.document.querySelectorAll('table.cards tbody tr')].map((row) => [
      row.getAttribute('data-type'),
      row.getAttribute('data-area'),
      row.getAttribute('data-statuses'),
    ]);

    expect(rows).toEqual(filterRows);
  });

  it('RF-503 keeps the filters hidden until the script shows them, and loads that script', () => {
    const page = filterPage();

    expect(page.document.querySelector('[data-card-filters]')?.hasAttribute('hidden')).toBe(true);
    expect(page.document.querySelector('[data-filter-empty]')?.hasAttribute('hidden')).toBe(true);
    expect(page.scripts).toEqual(['filters.js']);
  });

  it('RF-503 announces the count in a polite status and the empty state in words', () => {
    const page = filterPage();

    const status = page.document.querySelector('[data-filter-status]');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(page.document.querySelector('[data-filter-empty]')?.textContent).toContain(
      'No cards match',
    );
  });
});

describe('the card filters markup and the page', () => {
  it('RF-503 puts the filters before the table, so the keyboard reaches them first', () => {
    const page = filterPage();

    const order = [...page.document.querySelectorAll('[data-card-filters], table.cards')].map(
      (element) => element.tagName,
    );
    expect(order).toEqual(['DIV', 'TABLE']);
    expect(page.document.querySelector('[data-filter-reset]')?.tagName).toBe('BUTTON');
  });

  it('RF-503 shows no filters and loads no script for a run without cards', () => {
    const page = auditHtml(renderReportHtml(reportModel({ cards: [] })));

    expect(page.document.querySelector('[data-card-filters]')).toBeNull();
    expect(page.scripts).toEqual([]);
  });

  it('RF-507 shows an area name from the code as text in the option and the row', () => {
    const page = filterPage(
      filterCards.slice(0, 1).map((card) => ({ ...card, area: hostileText })),
    );

    expect(texts(page, 'select[data-filter="area"] option')).toEqual(['All areas', hostileText]);
    expect(page.document.querySelector('table.cards tbody tr')?.getAttribute('data-area')).toBe(
      hostileText,
    );
    expect(page.handlers).toEqual([]);
    expect(page.scripts).toEqual(['filters.js']);
    expect(
      page.document.querySelectorAll('[data-card-filters] script, [data-card-filters] img'),
    ).toHaveLength(0);
  });
});
