import { CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
import {
  formatShare,
  summariseVerification,
  type CardClaimCounts,
  type StatusTotals,
  type VerificationSummary,
} from '../../domain/cards/verification-summary.js';
import type { MarkdownEscaper } from './markdown-text.js';

// RF-303, ADR-005, data-model.md section 3.8: the words of the verification summary that `spec.md`
// and the report (`report.md`, `report.html`) share, so they say the same thing in the same order.

export const OVERALL_LABEL = 'All areas';

/** The column titles: the area, one per claim status in the vocabulary's order, the total, the share. */
export const SUMMARY_COLUMNS: readonly string[] = [
  'Area',
  ...CLAIM_STATUSES,
  'Total',
  'Supported share',
];

/** `Supported share: 3 of 7 claims (42.9%).` */
export function summaryHeadline({ overall }: VerificationSummary): string {
  const claims = overall.total === 1 ? 'claim' : 'claims';
  const share = formatShare(overall.supportedShare);
  return `Supported share: ${String(overall.counts.Supported)} of ${String(overall.total)} ${claims} (${share}).`;
}

/** The numbers of a row, after its area: a count per status, the total and the share. */
export function summaryCells(totals: StatusTotals): string[] {
  return [
    ...CLAIM_STATUSES.map((status) => String(totals.counts[status])),
    String(totals.total),
    formatShare(totals.supportedShare),
  ];
}

/**
 * The `## Verification summary` section as Markdown lines ending in a blank line; none for a run
 * without cards, which has no claims to count. Area names are model text and go through `esc`.
 */
// RF-303
export function verificationSummaryLines(
  cards: readonly CardClaimCounts[],
  esc: MarkdownEscaper,
): string[] {
  if (cards.length === 0) return [];
  const summary = summariseVerification(cards);
  const row = (name: string, totals: StatusTotals): string =>
    `| ${[name, ...summaryCells(totals)].join(' | ')} |`;
  return [
    '## Verification summary',
    '',
    summaryHeadline(summary),
    '',
    `| ${SUMMARY_COLUMNS.join(' | ')} |`,
    `|${SUMMARY_COLUMNS.map(() => '---').join('|')}|`,
    ...summary.areas.map((area) => row(esc.inline(area.area), area)),
    row(OVERALL_LABEL, summary.overall),
    '',
  ];
}
