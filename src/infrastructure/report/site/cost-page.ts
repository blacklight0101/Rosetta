import { h, type ComponentChild } from 'preact';
import type { ReportCostLine, ReportModel } from '../../../application/report/report-model.js';
import { renderPage } from '../page-shell.js';
import { dollars, moneyText, unknownCostText } from '../report-format.js';
import { ProjectTotals, usageSentence } from './dashboard-stats.js';
import { DataTable, Facts, Headline, ModelText } from './parts.js';
import { renderStatic } from './static-render.js';

// RF-500, RF-426, RF-427, RF-507, RF-1010, RF-1013, ADR-021: `cost.html`, the cost report of the run
// (data-model.md section 3.12) and the totals of the project when the report was generated. A run
// without a readable `cost.json` shows the totals of its manifest and says the detail is missing.

interface LineGroup {
  readonly id: string;
  readonly title: string;
  readonly first: string;
  readonly lines: readonly ReportCostLine[];
}

const LINE_COLUMNS = ['Calls', 'Input tokens', 'Output tokens', 'Cached input', 'Cost'];

function LineTable(props: {
  readonly group: LineGroup;
  readonly currency: string;
}): ComponentChild {
  const { group, currency } = props;
  if (group.lines.length === 0) return null;
  const rows = group.lines.map((line) => [
    h(ModelText, { text: line.key }),
    String(line.calls),
    String(line.inputTokens),
    String(line.outputTokens),
    String(line.cachedInputTokens),
    moneyText(currency, line.costMicros),
  ]);
  return h(
    'section',
    { 'aria-labelledby': `${group.id}-title` },
    h('h2', { id: `${group.id}-title` }, group.title),
    h(DataTable, {
      id: group.id,
      label: group.title,
      columns: [group.first, ...LINE_COLUMNS],
      rows,
    }),
  );
}

function DetailedCost(props: { readonly model: ReportModel }): ComponentChild {
  const { cost } = props.model;
  if (cost === null) return null;
  const { totals, currency } = cost;
  const version = cost.priceTableVersion === '' ? '' : ` (prices of ${cost.priceTableVersion})`;
  const unknown = unknownCostText(totals.unpricedCalls);
  const groups: readonly LineGroup[] = [
    { id: 'by-role', title: 'Cost by role', first: 'Role', lines: cost.byRole },
    { id: 'by-provider', title: 'Cost by provider', first: 'Provider', lines: cost.byProvider },
    { id: 'by-model', title: 'Cost by model', first: 'Model', lines: cost.byModel },
  ];
  return h(
    'div',
    null,
    h(
      Headline,
      null,
      `${moneyText(currency, totals.costMicros)} in ${String(totals.calls)} calls${version}.`,
    ),
    h(Facts, {
      rows: [
        ['Input tokens', String(totals.inputTokens)],
        ['Output tokens', String(totals.outputTokens)],
        ['Cached input tokens', String(totals.cachedInputTokens)],
        ['Cache write tokens', String(totals.cacheWriteInputTokens)],
        ['Cache write cost', moneyText(currency, totals.cacheWriteCostMicros)],
      ],
    }),
    unknown === '' ? null : h('p', null, unknown),
    groups.map((group) => h(LineTable, { group, currency })),
  );
}

/** Without `cost.json`: what the manifest recorded, or the fact that nothing was. */
function ManifestCost(props: { readonly model: ReportModel }): ComponentChild {
  const { totals } = props.model;
  if (totals === null) return h('p', null, 'No cost was recorded for this run.');
  return h(
    'div',
    null,
    h(Headline, null, usageSentence(dollars(totals.costMicros), totals)),
    h('p', null, 'The detailed cost report is not available for this run.'),
  );
}

function CostPage(props: { readonly model: ReportModel }): ComponentChild {
  const { model } = props;
  return h(
    'div',
    null,
    h('h1', null, 'Cost report'),
    model.cost === null ? h(ManifestCost, { model }) : h(DetailedCost, { model }),
    model.documents.cost
      ? h('p', null, h('a', { href: '../cost.md' }, 'The cost report as Markdown'))
      : null,
    h(ProjectTotals, { model }),
  );
}

// RF-500, RF-507, RF-1013
export function renderCostHtml(model: ReportModel): string {
  const main = renderStatic(h(CostPage, { model }));
  return renderPage({ page: 'cost', runKey: model.runKey, title: 'Cost report', main });
}
