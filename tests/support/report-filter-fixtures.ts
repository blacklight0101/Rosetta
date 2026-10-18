import type { ReportCard } from '../../src/application/report/report-model.js';
import { renderReportHtml } from '../../src/infrastructure/report/report-html.js';
import { auditHtml, type HtmlAudit } from './html-audit.js';
import { reportModel } from './report-fixtures.js';

// RF-503: cards of several types, areas and claim statuses for the tests of the dashboard filters.

const none = { Proposed: 0, CitationInvalid: 0, Supported: 0, Rejected: 0, Unverified: 0 };

function card(id: string, area: string, counts: Partial<typeof none>): ReportCard {
  const type = id.split('-')[0] ?? '';
  return {
    id,
    type,
    title: `Title of ${id}`,
    area,
    path: `cards/${type}/${id}.md`,
    claimCounts: { ...none, ...counts },
  };
}

/** Four cards: two areas, three types, and a card with no claim at all. */
export const filterCards: readonly ReportCard[] = [
  card('FEAT-001', 'orders', { Supported: 2 }),
  card('BR-001', 'orders', { Supported: 1, Rejected: 1 }),
  card('ENT-001', 'catalog', { CitationInvalid: 1 }),
  card('BR-002', 'catalog', {}),
];

/** What each row of `filterCards` carries: type, area and the statuses its claims have. */
export const filterRows: readonly (readonly [string, string, string])[] = [
  ['FEAT', 'orders', 'Supported'],
  ['BR', 'orders', 'Supported Rejected'],
  ['ENT', 'catalog', 'CitationInvalid'],
  ['BR', 'catalog', ''],
];

export function filterHtml(cards: readonly ReportCard[] = filterCards): string {
  return renderReportHtml(reportModel({ cards: [...cards] }));
}

export function filterPage(cards: readonly ReportCard[] = filterCards): HtmlAudit {
  return auditHtml(filterHtml(cards));
}
