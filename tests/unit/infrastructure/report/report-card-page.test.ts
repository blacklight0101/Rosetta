import { describe, expect, it } from 'vitest';
import type { ReportCardDetail } from '../../../../src/application/report/card-detail.js';
import { renderCardPage } from '../../../../src/infrastructure/report/site/card-page.js';
import { hrefsOf, pageOf, textsOf, withClaim } from '../../../support/card-page-helpers.js';
import {
  hostileText,
  plainDetail,
  reportModel,
  shippingCitation,
  sourceLines,
} from '../../../support/report-fixtures.js';

// RF-502, RF-125, RF-507, RF-1013, ADR-021: the page of a card shows each claim with its status and
// reason, and under it each citation: the cited lines with a few lines of context, their numbers and
// the permalink to the exact lines on GitHub. Everything from the card, the citations and the source
// lines is text; the lines are code and are never a link.

describe('the card page claims', () => {
  it('RF-502 shows each claim with its status and the reason of the verdict', () => {
    const page = pageOf();

    expect(textsOf(page, '#claims > li .claim-text')).toEqual([
      'Shipping is free when the total is over 50.',
      'Gift orders also ship free.',
    ]);
    expect(textsOf(page, '#claims > li .claim-status')).toEqual(['Supported', 'Rejected']);
    expect(textsOf(page, '#claims > li .claim-reason')).toEqual([
      'The cited lines compare the total with 50.',
      'The cited lines have no check for gifts.',
    ]);
  });

  it('RF-502 writes the status as a word with a glyph, never colour alone', () => {
    const page = pageOf();

    expect(
      page.document.querySelectorAll('#claims .claim-status svg[aria-hidden="true"]'),
    ).toHaveLength(2);
  });

  it('RF-502 says a citation-invalid claim in words', () => {
    const page = pageOf(
      withClaim({ status: 'CitationInvalid', reason: 'The file does not exist.' }),
    );

    expect(textsOf(page, '.claim-status')).toEqual(['Citation invalid']);
    expect(textsOf(page, '.claim-reason')).toEqual(['The file does not exist.']);
  });

  it('RF-502 shows a claim the verifier has not judged without a reason', () => {
    const page = pageOf(withClaim({ status: 'Proposed' }));

    expect(textsOf(page, '.claim-status')).toEqual(['Proposed']);
    expect(page.document.querySelectorAll('.claim-reason')).toHaveLength(0);
  });
});

describe('the card page citations', () => {
  it('RF-502 shows the cited lines with three lines of context on each side and their numbers', () => {
    const page = pageOf();
    const rows = page.document.querySelectorAll('#claims > li:first-child table.code tbody tr');

    expect([...rows].map((row) => row.querySelector('.ln')?.textContent.trim())).toEqual([
      ...['7', '8', '9', '10', '11', '12', '13', '14', '15'],
    ]);
    expect(rows[3]?.querySelector('.src')?.textContent).toBe('    total += 10;');
  });

  it('RF-502 marks the cited lines apart from the context, in a way that is not only colour', () => {
    const page = pageOf();
    const rows = [
      ...page.document.querySelectorAll('#claims > li:first-child table.code tbody tr'),
    ];

    const cited = rows.filter((row) => row.classList.contains('cited'));
    expect(cited.map((row) => row.querySelector('.ln')?.textContent.trim())).toEqual([
      ...['10', '11', '12'],
    ]);
    expect(cited.every((row) => row.querySelector('.mark')?.textContent.trim() !== '')).toBe(true);
    expect(rows[0]?.querySelector('.mark')?.textContent.trim()).toBe('');
  });

  it('RF-502 names the file and the lines of each citation', () => {
    const page = pageOf();

    expect(textsOf(page, '#claims > li:first-child .citation-name')).toEqual([
      'Orders/Shipping.cs:10-12',
    ]);
  });

  it('RF-502 says why the lines are not shown when they cannot be read, and still links them', () => {
    const page = pageOf(
      withClaim({
        citations: [
          { ...shippingCitation, excerpt: { kind: 'unavailable', reason: 'The file is ignored.' } },
        ],
      }),
    );

    expect(textsOf(page, '.excerpt-unavailable')).toEqual(['The file is ignored.']);
    expect(page.document.querySelectorAll('table.code')).toHaveLength(0);
    expect(page.document.querySelectorAll('a.permalink')).toHaveLength(1);
  });
});

describe('the card page citations and long files', () => {
  it('RF-502 numbers lines beyond 999', () => {
    const page = pageOf(
      withClaim({
        citations: [
          {
            ...shippingCitation,
            startLine: 1000,
            endLine: 1001,
            excerpt: { kind: 'lines', firstLine: 997, lines: sourceLines(997, 1004) },
          },
        ],
      }),
    );

    expect(textsOf(page, 'tr.cited .ln')).toEqual(['1000', '1001']);
  });
});

const hostileLine =
  '</td></tr></table><script>window.__pwned = 1</script><img src=x onerror=alert(1)>';
const lines = [
  '[a link](https://github.com/octo/demo) javascript:alert(1)',
  hostileLine,
  '[x](https://evil.example/)',
];
const hostile: ReportCardDetail = {
  ...withClaim({
    text: hostileText,
    reason: hostileText,
    citations: [
      {
        path: 'Orders/<script>.cs',
        startLine: 2,
        endLine: 2,
        excerpt: { kind: 'lines', firstLine: 1, lines },
      },
    ],
  }),
  title: hostileText,
  summary: hostileText,
  area: hostileText,
  note: hostileText,
};

describe('the card page and hostile text', () => {
  it('RF-507 runs nothing: no script, no handler, no foreign link', () => {
    const page = pageOf(hostile);

    expect(page.scripts).toEqual([]);
    expect(page.handlers).toEqual([]);
    expect(page.foreignLinks).toEqual([]);
    expect(page.inlineStyles).toBe(0);
    expect(page.document.querySelectorAll('img, script')).toHaveLength(0);
  });
});

describe('the card page and hostile source lines', () => {
  it('RF-507 shows the cited source lines as text, even a line that looks like markup or a link', () => {
    const page = pageOf(hostile);

    expect(textsOf(page, 'table.code .src')).toEqual(lines);
    expect(page.document.querySelectorAll('table.code a')).toHaveLength(0);
  });

  it('RF-507 shows the title, claim, reason and path as text', () => {
    const page = pageOf(hostile);

    expect(page.document.querySelector('h1')?.textContent).toContain('<script>window.__pwned');
    expect(textsOf(page, '.citation-name')).toEqual(['Orders/<script>.cs:2-2']);
    expect(textsOf(page, '.claim-reason')[0]).toContain('onerror=');
  });

  it('RF-507 keeps the dangerous text out of the markup of the page', () => {
    const html = renderCardPage(reportModel({ cardDetails: [hostile] }), hostile);

    expect(html).not.toContain('<script>window');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="https://evil.example');
  });
});

describe('the card page frame', () => {
  it('RF-1013 carries the content security policy and loads only the stylesheet of the report', () => {
    const page = pageOf();

    expect(page.csp).toContain("default-src 'self'");
    expect(page.scripts).toEqual([]);
    expect(page.document.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe(
      'report.css',
    );
  });

  it('RF-500 names the card, its type, area and confidence, and links back to the dashboard and the area', () => {
    const page = pageOf();

    expect(page.document.querySelector('h1')?.textContent).toBe('BR-001 Free shipping over 50');
    expect(textsOf(page, '.card-facts dd')).toEqual(
      expect.arrayContaining(['BR', 'orders', 'High']),
    );
    const crumbs = hrefsOf(page, 'nav.crumbs a');
    expect(crumbs[0]).toBe('report.html');
    expect(crumbs[1]).toMatch(/^[a-z0-9-]+\.html$/u);
  });

  it('RF-500 links the card file of the run', () => {
    const page = pageOf();

    expect(page.document.querySelector('a[href="../cards/BR/BR-001.md"]')).not.toBeNull();
  });

  it('RF-502 shows the question of an open question card', () => {
    const page = pageOf({
      ...plainDetail,
      id: 'OQ-001',
      type: 'OQ',
      question: 'Is stock checked?',
      whyItMatters: 'It changes the checkout.',
      questionState: 'Open',
    });
    const question = textsOf(page, '#question')[0];

    expect(question).toContain('Is stock checked?');
    expect(question).toContain('It changes the checkout.');
  });

  it('RF-206 shows the note that asks for care', () => {
    const page = pageOf({ ...plainDetail, note: 'written without reading the area' });

    expect(textsOf(page, '.card-note')).toEqual(['written without reading the area']);
  });
});
