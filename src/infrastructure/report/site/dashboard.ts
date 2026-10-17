import { h, type ComponentChild } from 'preact';
import {
  claimTotals,
  type ReportCard,
  type ReportModel,
} from '../../../application/report/report-model.js';
import { summariseVerification } from '../../../domain/cards/verification-summary.js';
import {
  OVERALL_LABEL,
  SUMMARY_COLUMNS,
  summaryCells,
  summaryHeadline,
} from '../../cards/verification-summary-text.js';
import {
  cardsSummary,
  claimsByArea,
  claimsText,
  COVERAGE_MISSING,
  dollars,
  plural,
} from '../report-format.js';
import { sourceLink } from '../report-source.js';
import {
  CardsByType,
  ClaimsByStatus,
  CoverageSummary,
  ProjectTotals,
  RunCost,
} from './dashboard-stats.js';
import { OverviewSection } from './overview-section.js';
import { DataTable, Facts, ModelText } from './parts.js';

// RF-500, RF-504, RF-507, RF-1013, DEC-44, DEC-52, ADR-021: `report.html`, the dashboard of a run: the
// facts of the run, the figures (cards by type, claims by status, coverage, cost, project totals),
// the documents and pages of the report, the areas, the verification summary and the cards. No script:
// the page is a document.

function sourceValue(model: ReportModel): ComponentChild {
  if (model.source === null) return null;
  const link = sourceLink(model.source);
  if (link === undefined) return model.source.url;
  return h('a', { href: link.href, rel: 'noopener noreferrer nofollow' }, link.label);
}

function costValue(model: ReportModel): string | null {
  const { totals } = model;
  if (totals === null) return null;
  const calls = plural(totals.calls, 'call');
  return `${dollars(totals.costMicros)} (${calls}, ${String(totals.inputTokens)} tokens in, ${String(totals.outputTokens)} out)`;
}

function RunFacts(props: { readonly model: ReportModel }): ComponentChild {
  const { model } = props;
  const optional = (name: string, value: ComponentChild): [string, ComponentChild][] =>
    value === null ? [] : [[name, value]];
  return h(Facts, {
    rows: [
      ['Stage', model.stage],
      ['State', model.endState ?? 'Not ended'],
      ...optional('Source', sourceValue(model)),
      ...optional('Started', model.startedAt),
      ...optional('Ended', model.endedAt),
      ...optional('Cost', costValue(model)),
    ],
  });
}

function documentItem(name: string, path: string, exists: boolean): ComponentChild {
  return exists
    ? h('li', null, h('a', { href: path }, name))
    : h('li', null, `${name}: not available for this run.`);
}

function Documents(props: { readonly model: ReportModel }): ComponentChild {
  const { documents: present, questions } = props.model;
  return h(
    'section',
    { 'aria-labelledby': 'documents' },
    h('h2', { id: 'documents' }, 'Documents'),
    h(
      'ul',
      null,
      documentItem('Specification', '../spec.md', present.spec),
      present.coverage
        ? h('li', null, h('a', { href: '../coverage.md' }, 'Coverage'))
        : h('li', null, COVERAGE_MISSING),
      documentItem('Cost report as Markdown', '../cost.md', present.cost),
      h(
        'li',
        null,
        h('a', { href: 'questions.html' }, 'Open questions'),
        ` (${String(questions.length)})`,
      ),
      h('li', null, h('a', { href: 'cost.html' }, 'Cost report')),
      h('li', null, h('a', { href: 'replay.html' }, 'Run replay')),
      h('li', null, h('a', { href: 'report.md' }, 'This report as Markdown')),
    ),
  );
}

function Areas(props: { readonly model: ReportModel }): ComponentChild {
  const { areas } = props.model;
  if (areas.length === 0) return null;
  return h(
    'section',
    { 'aria-labelledby': 'areas' },
    h('h2', { id: 'areas' }, 'Areas'),
    h(DataTable, {
      label: 'Map level of the areas',
      columns: ['Area', 'Map level'],
      rows: areas.map((area) => [h(ModelText, { text: area.name }), area.mapLevel]),
    }),
  );
}

/** RF-303: claims per status per area and the overall supported share; none for a run without cards. */
function Verification(props: { readonly model: ReportModel }): ComponentChild {
  const { cards } = props.model;
  if (cards.length === 0) return null;
  const summary = summariseVerification(claimsByArea(cards));
  const rows = [
    ...summary.areas.map((area) => [h(ModelText, { text: area.area }), ...summaryCells(area)]),
    [OVERALL_LABEL, ...summaryCells(summary.overall)],
  ];
  return h(
    'section',
    { 'aria-labelledby': 'verification' },
    h('h2', { id: 'verification' }, 'Verification summary'),
    h('p', null, summaryHeadline(summary)),
    h(DataTable, { label: 'Claims per status and area', columns: SUMMARY_COLUMNS, rows }),
  );
}

function cardRow(card: ReportCard): ComponentChild[] {
  return [
    card.path === '' ? card.id : h('a', { href: `../${card.path}` }, card.id),
    card.type,
    h(ModelText, { text: card.area }),
    claimsText(card.claimCounts),
    h(ModelText, { text: card.title }),
  ];
}

function Cards(props: { readonly model: ReportModel }): ComponentChild {
  const { cards } = props.model;
  return h(
    'section',
    { 'aria-labelledby': 'cards' },
    h('h2', { id: 'cards' }, 'Cards'),
    h('p', null, cardsSummary(cards.length, claimTotals(cards))),
    cards.length === 0
      ? null
      : h(DataTable, {
          tableClass: 'cards',
          label: 'Cards of the run',
          columns: ['Card', 'Type', 'Area', 'Claims', 'Title'],
          rows: cards.map(cardRow),
        }),
  );
}

/** The dashboard: everything the report says about the run on one page. */
// RF-500, RF-504, RF-507
export function Dashboard(props: { readonly model: ReportModel }): ComponentChild {
  const { model } = props;
  return h(
    'div',
    null,
    h('h1', null, 'Run report'),
    h(OverviewSection, { overview: model.overview }),
    h(RunFacts, { model }),
    h(
      'div',
      { class: 'stats' },
      h(CardsByType, { model }),
      h(ClaimsByStatus, { model }),
      h(CoverageSummary, { model }),
      h(RunCost, { model }),
      h(ProjectTotals, { model }),
    ),
    h(Documents, { model }),
    h(Areas, { model }),
    h(Verification, { model }),
    h(Cards, { model }),
  );
}
