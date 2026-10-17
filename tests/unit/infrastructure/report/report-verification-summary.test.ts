import { describe, expect, it } from 'vitest';
import type { ReportCard } from '../../../../src/application/report/report-model.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderReportHtml } from '../../../../src/infrastructure/report/report-html.js';
import { renderReportMarkdown } from '../../../../src/infrastructure/report/report-markdown.js';
import { auditHtml } from '../../../support/html-audit.js';
import { hostileText, plainCard, reportModel } from '../../../support/report-fixtures.js';

// RF-303, RF-504, RF-507, ADR-005: the report states claims per status per area and the overall
// supported share, in report.md and in report.html, from the same counts as the card list.

const masker = new SecretMasker();

function card(id: string, area: string, claimCounts: ReportCard['claimCounts']): ReportCard {
  return { ...plainCard, id, area, path: `cards/BR/${id}.md`, claimCounts };
}

const cards: readonly ReportCard[] = [
  card('BR-001', 'orders', { Supported: 2, Rejected: 1, Proposed: 0 }),
  card('BR-002', 'catalog', { Supported: 1, Unverified: 1 }),
  card('BR-003', 'orders', { CitationInvalid: 1 }),
];

function markdown(list: readonly ReportCard[]): string {
  return renderReportMarkdown(reportModel({ cards: list }), masker);
}

function summaryRows(page: ReturnType<typeof auditHtml>): string[][] {
  const rows = page.document.querySelectorAll('section[aria-labelledby="verification"] tbody tr');
  return [...rows].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent));
}

describe('report.md verification summary', () => {
  it('RF-303 shows claims per status per area and the overall supported share', () => {
    const text = markdown(cards);

    expect(text).toContain('Supported share: 3 of 7 claims (42.9%).');
    expect(text).toContain('| orders | 0 | 1 | 2 | 1 | 0 | 4 | 50.0% |');
    expect(text).toContain('| catalog | 0 | 0 | 1 | 0 | 1 | 2 | 50.0% |');
    expect(text).toContain('| All areas | 0 | 1 | 3 | 1 | 1 | 7 | 42.9% |');
  });

  it('RF-303 puts the summary between the documents and the card list', () => {
    const text = markdown(cards);

    expect(text.indexOf('## Documents')).toBeLessThan(text.indexOf('## Verification summary'));
    expect(text.indexOf('## Verification summary')).toBeLessThan(text.indexOf('## Cards'));
  });

  it('RF-303 leaves the summary out of a run without cards, which has no claims to count', () => {
    expect(markdown([])).not.toContain('Verification summary');
  });

  it('RF-303 says n/a for the share of cards that hold no claim', () => {
    const text = markdown([card('BR-009', 'orders', {})]);

    expect(text).toContain('Supported share: 0 of 0 claims (n/a).');
    expect(text).toContain('| orders | 0 | 0 | 0 | 0 | 0 | 0 | n/a |');
  });

  it('RF-507 writes a hostile area name as text', () => {
    const text = markdown([card('BR-010', hostileText, { Supported: 1 })]);
    const row = text.split('\n').find((line) => line.endsWith('| 1 | 100.0% |')) ?? '';

    expect(row).not.toContain('<script');
    expect(row).not.toContain('<img');
    expect(row).not.toContain('](javascript:');
  });
});

describe('report.html verification summary', () => {
  it('RF-303 shows the same rows and share as a table', () => {
    const page = auditHtml(renderReportHtml(reportModel({ cards })));

    expect(summaryRows(page)).toEqual([
      ['orders', '0', '1', '2', '1', '0', '4', '50.0%'],
      ['catalog', '0', '0', '1', '0', '1', '2', '50.0%'],
      ['All areas', '0', '1', '3', '1', '1', '7', '42.9%'],
    ]);
    expect(page.document.body.textContent).toContain('Supported share: 3 of 7 claims (42.9%).');
  });

  it('RF-303 leaves the section out of a run without cards', () => {
    const page = auditHtml(renderReportHtml(reportModel({ cards: [] })));

    expect(page.document.querySelector('#verification')).toBeNull();
  });

  it('RF-507 shows a hostile area name as text and runs nothing', () => {
    const page = auditHtml(
      renderReportHtml(reportModel({ cards: [card('BR-010', hostileText, { Supported: 1 })] })),
    );

    expect(summaryRows(page)[0]?.[0]).toBe(hostileText);
    expect(page.scripts).toEqual([]);
    expect(page.handlers).toEqual([]);
    expect(page.document.querySelectorAll('img')).toHaveLength(0);
  });
});
