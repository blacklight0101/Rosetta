import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Window, type HTMLSelectElement } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { filterCards, filterHtml } from '../../../support/report-filter-fixtures.js';

// RF-503, RF-507: the filter script hides the rows that do not match the chosen type, area and
// status, says how many are left, shows an empty state when none is, and takes its start state
// from the address only when it names an option the page offers. It runs here in happy-dom against
// the page the writer produces; the end-to-end spec runs it in a browser from disk.

const script = await readFile(
  fileURLToPath(new URL('../../../../templates/report/filters.js', import.meta.url)),
  'utf8',
);

function pageAt(address = 'http://localhost/report.html', cards = filterCards): Window {
  const window = new Window({ url: address, settings: { disableJavaScriptEvaluation: false } });
  window.document.write(filterHtml(cards));
  window.eval(script);
  return window;
}

function selectOf(window: Window, key: string): HTMLSelectElement {
  const select = window.document.querySelector<HTMLSelectElement>(`select[data-filter="${key}"]`);
  if (select === null) throw new Error(`No ${key} select`);
  return select;
}

const rowsOf = (window: Window) => [...window.document.querySelectorAll('table.cards tbody tr')];
const shown = (window: Window): string[] =>
  rowsOf(window)
    .filter((row) => !row.hasAttribute('hidden'))
    .map((row) => row.querySelector('td')?.textContent ?? '');

function choose(window: Window, key: string, value: string): void {
  const select = selectOf(window, key);
  select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}
const statusOf = (window: Window): string =>
  window.document.querySelector('[data-filter-status]')?.textContent ?? '';
const isHidden = (window: Window, selector: string): boolean =>
  window.document.querySelector(selector)?.hasAttribute('hidden') ?? false;
const tableHidden = (window: Window): boolean =>
  window.document.querySelector('table.cards')?.parentElement?.hasAttribute('hidden') ?? false;

describe('the filter script', () => {
  it('RF-503 shows the filters and every card to begin with', () => {
    const window = pageAt();

    expect(isHidden(window, '[data-card-filters]')).toBe(false);
    expect(shown(window)).toEqual(['FEAT-001', 'BR-001', 'ENT-001', 'BR-002']);
    expect(statusOf(window)).toBe('Showing 4 of 4 cards');
  });

  it('RF-503 says card, not cards, for a run with one card', () => {
    const window = pageAt('http://localhost/report.html', filterCards.slice(0, 1));

    expect(statusOf(window)).toBe('Showing 1 of 1 card');
  });

  it('RF-503 shows only the cards of the chosen type', () => {
    const window = pageAt();

    choose(window, 'type', 'BR');

    expect(shown(window)).toEqual(['BR-001', 'BR-002']);
    expect(statusOf(window)).toBe('Showing 2 of 4 cards');
  });

  it('RF-503 shows only the cards of the chosen area', () => {
    const window = pageAt();

    choose(window, 'area', 'catalog');

    expect(shown(window)).toEqual(['ENT-001', 'BR-002']);
  });

  it('RF-503 shows the cards that have a claim of the chosen status, whatever else they have', () => {
    const window = pageAt();

    choose(window, 'status', 'Rejected');
    expect(shown(window)).toEqual(['BR-001']);

    choose(window, 'status', 'Supported');
    expect(shown(window)).toEqual(['FEAT-001', 'BR-001']);
  });
});

describe('the filter script and the empty state', () => {
  it('RF-503 combines the three filters and gives the cards back when one is cleared', () => {
    const window = pageAt();

    choose(window, 'type', 'BR');
    choose(window, 'area', 'orders');
    choose(window, 'status', 'Supported');
    expect(shown(window)).toEqual(['BR-001']);

    choose(window, 'area', '');
    expect(shown(window)).toEqual(['BR-001']);
    choose(window, 'status', '');
    expect(shown(window)).toEqual(['BR-001', 'BR-002']);
  });

  it('RF-503 says so, and hides the table, when no card matches', () => {
    const window = pageAt();

    choose(window, 'type', 'ENT');
    choose(window, 'area', 'orders');

    expect(shown(window)).toEqual([]);
    expect(statusOf(window)).toBe('Showing 0 of 4 cards');
    expect(isHidden(window, '[data-filter-empty]')).toBe(false);
    expect(tableHidden(window)).toBe(true);
  });

  it('RF-503 gives every card back, and the table, when Reset is pressed', () => {
    const window = pageAt();
    choose(window, 'type', 'ENT');
    choose(window, 'area', 'orders');

    const reset = window.document.querySelector('[data-filter-reset]');
    reset?.dispatchEvent(new window.Event('click', { bubbles: true }));

    expect(shown(window)).toHaveLength(4);
    expect(isHidden(window, '[data-filter-empty]')).toBe(true);
    expect(tableHidden(window)).toBe(false);
    expect(selectOf(window, 'type').value).toBe('');
    expect(selectOf(window, 'area').value).toBe('');
    expect(window.location.hash).toBe('');
  });
});

describe('the filter script and the address it writes', () => {
  it('RF-503 writes the choice to the address, so it can be shared, and clears it again', () => {
    const window = pageAt();

    choose(window, 'type', 'BR');
    choose(window, 'status', 'Supported');
    expect(window.location.hash).toBe('#type=BR&status=Supported');

    choose(window, 'type', '');
    choose(window, 'status', '');
    expect(window.location.hash).toBe('');
  });
});

describe('the filter script and the address it opens with', () => {
  it('RF-503 starts from the filters the address names', () => {
    const window = pageAt('http://localhost/report.html#type=BR&area=catalog');

    expect(shown(window)).toEqual(['BR-002']);
    expect(selectOf(window, 'type').value).toBe('BR');
    expect(selectOf(window, 'area').value).toBe('catalog');
    expect(statusOf(window)).toBe('Showing 1 of 4 cards');
  });
});

describe('the filter script and a hostile address', () => {
  it('RF-507 ignores a value that is no option of the page, whatever it holds', () => {
    const hostile = [
      '#type=<script>window.__pwned=1</script>',
      '#type=NOPE',
      '#area=%22%3E%3Cimg%20src%3Dx%20onerror%3Dwindow.__pwned%3D1%3E',
      '#status=javascript:window.__pwned=1',
      `#area=${'a'.repeat(100_000)}`,
      '#type[]=BR&status[]=Supported',
      '#type=__proto__&area=constructor',
    ];

    for (const hash of hostile) {
      const window = pageAt(`http://localhost/report.html${hash}`);

      expect(shown(window)).toHaveLength(4);
      expect(window.document.querySelectorAll('script, img')).toHaveLength(1);
      expect(isHidden(window, '[data-filter-empty]')).toBe(true);
      expect(statusOf(window)).toBe('Showing 4 of 4 cards');
      for (const key of ['type', 'area', 'status']) {
        expect(selectOf(window, key).selectedIndex).toBe(0);
      }
    }
  });
});

describe('the filter script and a mixed address', () => {
  it('RF-507 keeps the valid part of an address whose other part is hostile', () => {
    const window = pageAt('http://localhost/report.html#type=NOPE&status=Rejected');

    expect(shown(window)).toEqual(['BR-001']);
    expect(selectOf(window, 'type').value).toBe('');
  });

  it('RF-507 ignores an address with a very long fragment, even when its start is valid', () => {
    const window = pageAt(`http://localhost/report.html#type=BR&x=${'a'.repeat(5000)}`);

    expect(shown(window)).toHaveLength(4);
  });

  it('RF-507 ignores the query string, which carries no filter state', () => {
    const window = pageAt('http://localhost/report.html?type=BR&area=catalog');

    expect(shown(window)).toHaveLength(4);
  });

  it('RF-507 builds no markup from text: it only toggles attributes and sets text', () => {
    expect(script).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/u,
    );
  });
});
