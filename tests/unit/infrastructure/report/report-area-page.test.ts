import { describe, expect, it } from 'vitest';
import { renderAreaPage } from '../../../../src/infrastructure/report/site/area-page.js';
import {
  areaPageName,
  cardPageName,
} from '../../../../src/infrastructure/report/site/page-names.js';
import { auditHtml } from '../../../support/html-audit.js';
import {
  hostileText,
  plainCard,
  plainDetail,
  reportModel,
} from '../../../support/report-fixtures.js';

// RF-500, RF-507, RF-1013, ADR-021: the page of an area: how it was mapped and read, and its cards,
// each linked to its page. Area names are repository text.

type Overrides = Parameters<typeof reportModel>[0];

function pageOf(area = 'orders', overrides: Overrides = {}) {
  return auditHtml(renderAreaPage(reportModel(overrides), area));
}

const textsOf = (page: ReturnType<typeof pageOf>, selector: string): string[] =>
  [...page.document.querySelectorAll(selector)].map((item) => item.textContent.trim());

const ledger = {
  ...plainCard,
  id: 'ENT-001',
  type: 'ENT',
  title: 'Ledger entry',
  area: 'LEDGER',
  path: 'cards/ENT/ENT-001.md',
};
const catalogCoverage = { area: 'catalog', filesListed: 2, filesRead: 1, readTokenShare: 0.4 };

describe('the area page', () => {
  it('RF-500 names the area and links back to the dashboard', () => {
    const page = pageOf('orders', { areas: [{ name: 'orders', mapLevel: 'symbols' }] });

    expect(page.document.querySelector('h1')?.textContent).toBe('Area orders');
    expect(page.document.querySelector('nav.crumbs a')?.getAttribute('href')).toBe('report.html');
  });

  it('RF-500 shows the map level and what the agents read of the area', () => {
    const page = pageOf('catalog', {
      areas: [{ name: 'catalog', mapLevel: 'coarse' }],
      cards: [],
      coverage: {
        filesListed: 2,
        filesRead: 1,
        readTokenShare: 0.4,
        areas: [{ ...catalogCoverage, note: 'one file was too large' }],
      },
    });

    expect(textsOf(page, '.area-facts dd')).toEqual(
      expect.arrayContaining(['coarse', '1 of 2', '40.0%']),
    );
    expect(textsOf(page, '#area-notes')[0]).toContain('one file was too large');
  });

  it('RF-500 shows the failure of an area that gave no usable card', () => {
    const page = pageOf('catalog', {
      cards: [],
      coverage: {
        filesListed: 2,
        filesRead: 0,
        readTokenShare: 0,
        areas: [{ ...catalogCoverage, filesRead: 0, readTokenShare: 0, failure: 'no usable card' }],
      },
    });

    expect(textsOf(page, '#area-notes')[0]).toContain('no usable card');
  });
});

describe('the area page and its cards', () => {
  it('RF-500 lists the cards of the area, each linked to its page, with its claims by status', () => {
    const page = pageOf('orders', { cards: [plainCard, ledger], cardDetails: [plainDetail] });
    const rows = [...page.document.querySelectorAll('#area-cards tbody tr')];

    expect(rows).toHaveLength(1);
    expect(rows[0]?.querySelector('a')?.getAttribute('href')).toBe(cardPageName('BR-001'));
    expect(textsOf(page, '#area-cards tbody td')).toEqual([
      'BR-001',
      'BR',
      '1 Supported',
      'Free shipping over 50',
    ]);
  });

  it('RF-500 links a card without a page to its card file', () => {
    const page = pageOf('orders', { cards: [plainCard], cardDetails: [] });

    expect(page.document.querySelector('#area-cards tbody a')?.getAttribute('href')).toBe(
      '../cards/BR/BR-001.md',
    );
  });

  it('RF-500 says an area has no cards', () => {
    const page = pageOf('orders', { cards: [] });

    expect(textsOf(page, '#area-cards p')).toEqual(['This area has no cards.']);
  });

  it('RF-500 matches the area name exactly, so a name that differs in case is another area', () => {
    const page = pageOf('ledger', { cards: [ledger] });

    expect(textsOf(page, '#area-cards p')).toEqual(['This area has no cards.']);
  });
});

describe('the area page and its frame', () => {
  it('RF-1013 carries the policy and loads no script', () => {
    const page = pageOf();

    expect(page.csp).toContain("default-src 'self'");
    expect(page.scripts).toEqual([]);
  });

  it('RF-507 shows a hostile area name, card title and note as text', () => {
    const hostileCard = { ...plainCard, area: hostileText, title: hostileText };
    const page = pageOf(hostileText, {
      cards: [hostileCard],
      areas: [{ name: hostileText, mapLevel: 'symbols' }],
      coverage: {
        filesListed: 1,
        filesRead: 1,
        readTokenShare: 1,
        areas: [{ ...catalogCoverage, area: hostileText, note: hostileText }],
      },
    });

    expect(page.scripts).toEqual([]);
    expect(page.handlers).toEqual([]);
    expect(page.foreignLinks).toEqual([]);
    expect(page.document.querySelectorAll('img, script')).toHaveLength(0);
    expect(page.document.querySelector('h1')?.textContent).toContain('<script>window.__pwned');
  });
});

describe('the file names of the area and card pages', () => {
  it('RF-501 gives a file name of plain characters that sits directly in the report folder', () => {
    const names = ['orders', 'A/B', '../../x', 'a b&c.d', hostileText, '', 'Ünï', 'a'.repeat(500)];

    for (const name of names) {
      expect(areaPageName(name)).toMatch(/^area-[a-z0-9-]{0,48}\.html$/u);
    }
  });

  it('RF-501 gives different names to areas that differ only in case or in characters', () => {
    const names = ['orders', 'Orders', 'orders/', 'orders-', 'ORDERS', 'o r d e r s', 'orders.'];

    expect(new Set(names.map(areaPageName)).size).toBe(names.length);
  });

  it('RF-501 gives the same name to the same area every time', () => {
    expect(areaPageName('orders')).toBe(areaPageName('orders'));
  });

  it('RF-501 names the page of a card after its id', () => {
    expect(cardPageName('BR-001')).toBe('card-BR-001.html');
  });
});
