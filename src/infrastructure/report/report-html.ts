import {
  claimTotals,
  type ReportCard,
  type ReportModel,
} from '../../application/report/report-model.js';
import { escapeHtml, renderModelText } from './html-text.js';
import { renderPage } from './page-shell.js';
import { cardsSummary, claimsText, COVERAGE_MISSING, dollars, plural } from './report-format.js';
import { sourceLink } from './report-source.js';

// RF-504, RF-507, RF-1013, DEC-112: `report.html`, the report as static HTML in `report/` of the run
// folder. Every repository and model text is escaped (model text keeps only the links to
// github.com), so the published `site/` never relies on a Markdown renderer. No script: the page
// is a document.

function fact(name: string, value: string): string {
  return `<div><dt>${name}</dt><dd>${value}</dd></div>`;
}

function sourceValue(model: ReportModel): string | undefined {
  if (model.source === null) return undefined;
  const link = sourceLink(model.source);
  return link === undefined
    ? escapeHtml(model.source.url)
    : `<a href="${escapeHtml(link.href)}" rel="noopener noreferrer nofollow">${escapeHtml(link.label)}</a>`;
}

function costValue(model: ReportModel): string | undefined {
  const { totals } = model;
  if (totals === null) return undefined;
  const calls = plural(totals.calls, 'call');
  return `${dollars(totals.costMicros)} (${calls}, ${String(totals.inputTokens)} tokens in, ${String(totals.outputTokens)} out)`;
}

function facts(model: ReportModel): string {
  const optional = (name: string, value: string | undefined | null): string[] =>
    value === undefined || value === null ? [] : [fact(name, value)];
  const rows = [
    fact('Stage', escapeHtml(model.stage)),
    fact('State', escapeHtml(model.endState ?? 'Not ended')),
    ...optional('Source', sourceValue(model)),
    ...optional('Started', model.startedAt === null ? null : escapeHtml(model.startedAt)),
    ...optional('Ended', model.endedAt === null ? null : escapeHtml(model.endedAt)),
    ...optional('Cost', costValue(model)),
  ];
  return `<dl class="facts">\n${rows.join('\n')}\n</dl>`;
}

function documentItem(name: string, path: string, exists: boolean): string {
  return exists
    ? `<li><a href="${path}">${name}</a></li>`
    : `<li>${name}: not available for this run.</li>`;
}

function documents(model: ReportModel): string {
  const { documents: present } = model;
  const items = [
    documentItem('Specification', '../spec.md', present.spec),
    present.coverage
      ? '<li><a href="../coverage.md">Coverage</a></li>'
      : `<li>${COVERAGE_MISSING}</li>`,
    documentItem('Cost report', '../cost.md', present.cost),
    '<li><a href="replay.html">Run replay</a></li>',
    '<li><a href="report.md">This report as Markdown</a></li>',
  ];
  return `<section aria-labelledby="documents">
<h2 id="documents">Documents</h2>
<ul>
${items.join('\n')}
</ul>
</section>`;
}

function cardRow(card: ReportCard): string {
  const id = escapeHtml(card.id);
  const link = card.path === '' ? id : `<a href="../${escapeHtml(card.path)}">${id}</a>`;
  const cells = [
    link,
    escapeHtml(card.type),
    renderModelText(card.area),
    claimsText(card.claimCounts),
    renderModelText(card.title),
  ];
  return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
}

function cards(model: ReportModel): string {
  const summary = cardsSummary(model.cards.length, claimTotals(model.cards));
  const table =
    model.cards.length === 0
      ? ''
      : `
<div class="table-wrap" role="region" aria-label="Cards of the run" tabindex="0">
<table>
<thead><tr><th scope="col">Card</th><th scope="col">Type</th><th scope="col">Area</th><th scope="col">Claims</th><th scope="col">Title</th></tr></thead>
<tbody>
${model.cards.map(cardRow).join('\n')}
</tbody>
</table>
</div>`;
  return `<section aria-labelledby="cards">
<h2 id="cards">Cards</h2>
<p>${summary}</p>${table}
</section>`;
}

// RF-504, RF-507, RF-1013, DEC-112
export function renderReportHtml(model: ReportModel): string {
  const main = ['<h1>Run report</h1>', facts(model), documents(model), cards(model)].join('\n');
  return renderPage({ page: 'report', runKey: model.runKey, title: 'Run report', main });
}
