import { h, type ComponentChild } from 'preact';
import {
  claimTotals,
  type GithubReportSource,
  type ReportCard,
  type ReportModel,
  type UploadReportSource,
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
import { UNNAMED_ZIP } from '../../../domain/sources/upload-facts.js';
import {
  CardsByType,
  ClaimsByStatus,
  CoverageSummary,
  ProjectTotals,
  RunCost,
} from './dashboard-stats.js';
import { areaLink, cardHref } from './crumbs.js';
import { OverviewSection } from './overview-section.js';
import { CardFilters, cardRowAttributes } from './card-filters.js';
import { DataTable, Facts, ModelText } from './parts.js';

// RF-500, RF-504, RF-507, RF-1013, DEC-44, DEC-52, ADR-021: `report.html`, the dashboard of a run: the
// facts of the run, the figures (cards by type, claims by status, coverage, cost, project totals),
// the documents and pages of the report, the areas, the verification summary and the cards. The page is a document: the one script (`filters.js`, RF-503)
// only filters the rows of the cards table when cards exist, and the page is whole without it.

function sourceValue(source: GithubReportSource): ComponentChild {
  const link = sourceLink(source);
  if (link === undefined) return source.url;
  return h('a', { href: link.href, rel: 'noopener noreferrer nofollow' }, link.label);
}

/** RF-131: the zip, the upload date and the hash; text, never a link. */
function uploadRows(source: UploadReportSource): [string, ComponentChild][] {
  const { fileName, uploadedAt, snapshotHash } = source;
  const rows: [string, ComponentChild][] = [['Source', fileName ?? UNNAMED_ZIP]];
  if (uploadedAt !== null) rows.push(['Uploaded', uploadedAt]);
  if (snapshotHash !== null) rows.push(['Snapshot', snapshotHash]);
  return rows;
}

function sourceRows(model: ReportModel): [string, ComponentChild][] {
  const { source } = model;
  if (source === null) return [];
  if (source.kind === 'upload') return uploadRows(source);
  return [['Source', sourceValue(source)]];
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
      ...sourceRows(model),
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
  const diagrams = props.model.diagrams?.length ?? 0;
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
      diagrams === 0
        ? null
        : h('li', null, h('a', { href: 'diagrams.html' }, 'Diagrams'), ` (${String(diagrams)})`),
      h('li', null, h('a', { href: 'report.md' }, 'This report as Markdown')),
    ),
  );
}

/** RF-505: "Download all", the zips written beside the report; none for a report without them. */
function Downloads(props: { readonly model: ReportModel }): ComponentChild {
  const { downloads } = props.model;
  if (downloads === undefined) return null;
  return h(
    'section',
    { id: 'downloads-section', 'aria-labelledby': 'downloads' },
    h('h2', { id: 'downloads' }, 'Download all'),
    h(
      'ul',
      null,
      h(
        'li',
        null,
        h('a', { href: downloads.run, download: downloads.run }, 'Download all: the run as a zip'),
        ': every card, the specification and the folder structure.',
      ),
      downloads.handoff === undefined
        ? null
        : h(
            'li',
            null,
            h(
              'a',
              { href: downloads.handoff, download: downloads.handoff },
              'Download the hand-off package as a zip',
            ),
            '.',
          ),
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
      rows: areas.map((area) => [
        areaLink(area.name, h(ModelText, { text: area.name })),
        area.mapLevel,
      ]),
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

function cardRow(model: ReportModel, card: ReportCard): ComponentChild[] {
  const href = cardHref(model, card);
  return [
    href === null ? card.id : h('a', { href }, card.id),
    card.type,
    areaLink(card.area, h(ModelText, { text: card.area })),
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
    cards.length === 0 ? null : h(CardFilters, { cards }),
    cards.length === 0
      ? null
      : h(DataTable, {
          tableClass: 'cards',
          label: 'Cards of the run',
          columns: ['Card', 'Type', 'Area', 'Claims', 'Title'],
          rows: cards.map((card) => cardRow(props.model, card)),
          rowAttributes: cards.map(cardRowAttributes),
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
    h(Downloads, { model }),
    h(Areas, { model }),
    h(Verification, { model }),
    h(Cards, { model }),
  );
}
