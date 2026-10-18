import { h, type ComponentChild } from 'preact';
import {
  claimTotals,
  type ReportCoverage,
  type ReportModel,
  type ReportProjectTotals,
} from '../../../application/report/report-model.js';
import { CLAIM_STATUSES } from '../../../domain/cards/card-vocabulary.js';
import { formatShare, summariseVerification } from '../../../domain/cards/verification-summary.js';
import { summaryHeadline } from '../../cards/verification-summary-text.js';
import { claimsByArea, costPhrase, dollars, plural, unknownCostText } from '../report-format.js';
import { STATUS_GLYPHS } from './claim-status.js';
import { DataTable, Glyph, Headline, ModelText, Panel } from './parts.js';

// RF-500, RF-1010, DEC-44: the figures at the top of the dashboard: the cards by type, the claims by
// status, the coverage, the cost of the run and the totals of the project when the report was
// generated. Every figure is written as text; a drawing only repeats it.

const byCodeUnit = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

// RF-500
export function CardsByType(props: { readonly model: ReportModel }): ComponentChild {
  const counts = new Map<string, number>();
  for (const card of props.model.cards) counts.set(card.type, (counts.get(card.type) ?? 0) + 1);
  const items = [...counts]
    .sort(([left], [right]) => byCodeUnit(left, right))
    .map(([type, n]) => h('li', null, `${type}: ${plural(n, 'card')}`));
  return h(
    Panel,
    { id: 'cards-by-type', title: 'Cards by type' },
    items.length === 0 ? h('p', null, 'No cards.') : h('ul', { class: 'chips' }, items),
  );
}

/** One bar split by status; the label gives the same counts to a reader who cannot see it. */
function StatusBar(props: { readonly totals: Readonly<Record<string, number>> }): ComponentChild {
  const all = CLAIM_STATUSES.reduce((sum, status) => sum + (props.totals[status] ?? 0), 0);
  let offset = 0;
  const segments = CLAIM_STATUSES.map((status) => {
    const width = all === 0 ? 0 : ((props.totals[status] ?? 0) / all) * 100;
    const segment = h('rect', {
      class: `bar-${status}`,
      x: offset.toFixed(2),
      y: 0,
      width: width.toFixed(2),
      height: 8,
    });
    offset += width;
    return segment;
  });
  const label = CLAIM_STATUSES.map((status) => `${String(props.totals[status] ?? 0)} ${status}`);
  return h(
    'svg',
    {
      role: 'img',
      'aria-label': label.join(', '),
      viewBox: '0 0 100 8',
      class: 'bar',
      preserveAspectRatio: 'none',
    },
    h('rect', { class: 'bar-track', x: 0, y: 0, width: 100, height: 8 }),
    segments,
  );
}

// RF-500
export function ClaimsByStatus(props: { readonly model: ReportModel }): ComponentChild {
  const totals = claimTotals(props.model.cards);
  const items = CLAIM_STATUSES.map((status) =>
    h(
      'li',
      { class: `status-${status}` },
      h(Glyph, { name: STATUS_GLYPHS[status] ?? 'dot' }),
      `${status}: ${String(totals[status] ?? 0)}`,
    ),
  );
  const summary = summariseVerification(claimsByArea(props.model.cards));
  return h(
    Panel,
    { id: 'claims-by-status', title: 'Claims by status' },
    h(Headline, null, summaryHeadline(summary)),
    h(StatusBar, { totals }),
    h('ul', { class: 'chips' }, items),
  );
}

function coverageNote(failure: string | undefined, note: string | undefined): ComponentChild {
  const text = [failure, note].filter((part) => part !== undefined).join('; ');
  return text === '' ? '' : h(ModelText, { text });
}

function CoverageTable(props: { readonly coverage: ReportCoverage }): ComponentChild {
  const rows = props.coverage.areas.map((each) => [
    h(ModelText, { text: each.area }),
    `${String(each.filesRead)} of ${String(each.filesListed)}`,
    formatShare(each.readTokenShare),
    coverageNote(each.failure, each.note),
  ]);
  return h(DataTable, {
    label: 'Coverage of the areas',
    columns: ['Area', 'Files read', 'Tokens read', 'Note'],
    rows,
  });
}

// RF-500, RF-230
export function CoverageSummary(props: { readonly model: ReportModel }): ComponentChild {
  const { coverage } = props.model;
  if (coverage === null) {
    return h(
      Panel,
      { id: 'coverage', title: 'Coverage' },
      h('p', null, 'No coverage figures for this run.'),
    );
  }
  const headline = `Files read: ${String(coverage.filesRead)} of ${String(coverage.filesListed)}. Tokens read: ${formatShare(coverage.readTokenShare)}.`;
  return h(
    Panel,
    { id: 'coverage', title: 'Coverage' },
    h(Headline, null, headline),
    coverage.areas.length === 0 ? null : h(CoverageTable, { coverage }),
  );
}

/** `$0.0040 in 3 calls, 3600 tokens in, 330 out.` */
export function usageSentence(
  cost: string,
  figures: { readonly calls: number; readonly inputTokens: number; readonly outputTokens: number },
): string {
  const calls = plural(figures.calls, 'call');
  return `${cost} in ${calls}, ${String(figures.inputTokens)} tokens in, ${String(figures.outputTokens)} out.`;
}

// RF-500
export function RunCost(props: { readonly model: ReportModel }): ComponentChild {
  const { cost, totals } = props.model;
  const figures = cost?.totals ?? totals;
  const body =
    figures === null
      ? h('p', null, 'No cost was recorded for this run.')
      : h(Headline, null, usageSentence(dollars(figures.costMicros), figures));
  return h(
    Panel,
    { id: 'cost', title: 'Cost of this run' },
    body,
    h('p', null, h('a', { href: 'cost.html' }, 'Cost report')),
  );
}

function projectSentence(totals: ReportProjectTotals, generatedAt: string): string {
  if (totals.calls === 0) return `Project totals at ${generatedAt}: nothing spent yet.`;
  return `Project totals at ${generatedAt}: ${usageSentence(costPhrase(totals.cost), totals)}`;
}

// RF-1010
export function ProjectTotals(props: { readonly model: ReportModel }): ComponentChild {
  const { projectTotals, generatedAt } = props.model;
  if (projectTotals === null) {
    return h(
      Panel,
      { id: 'project-totals', title: 'Project totals' },
      h('p', null, 'The project totals are not available for this report.'),
    );
  }
  const unknown = unknownCostText(projectTotals.unknownCostCalls);
  return h(
    Panel,
    { id: 'project-totals', title: 'Project totals' },
    h(Headline, null, projectSentence(projectTotals, generatedAt)),
    unknown === '' ? null : h('p', null, unknown),
  );
}
