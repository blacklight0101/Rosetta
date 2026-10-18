import { h } from 'preact';
import type { ReportModel } from '../../application/report/report-model.js';
import { renderPage } from './page-shell.js';
import { Dashboard } from './site/dashboard.js';
import { renderStatic } from './site/static-render.js';

// RF-500, RF-504, RF-507, RF-1013, DEC-44, DEC-52, DEC-112, ADR-021: `report.html`, the dashboard of
// the run as static HTML, rendered from Preact components when the report is built. Every repository
// and model text is escaped by the renderer (model text keeps only the links to github.com), so the
// published `site/` never relies on a Markdown renderer. No script: the page is a document.

// RF-500, RF-504, RF-507, RF-1013, DEC-112
export function renderReportHtml(model: ReportModel): string {
  const main = renderStatic(h(Dashboard, { model }));
  return renderPage({ page: 'report', runKey: model.runKey, title: 'Run report', main });
}
