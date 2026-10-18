import type { ReportModel } from '../../application/report/report-model.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { escapeHtml } from './html-text.js';
import type { DiagramAssets } from './report-assets.js';
import { renderReplayHtml } from './replay-html.js';
import { renderReportHtml } from './report-html.js';
import { renderReportMarkdown } from './report-markdown.js';
import { renderCostHtml } from './site/cost-page.js';
import { renderDiagramsPage } from './site/diagrams-page.js';
import { renderEvidencePages } from './site/evidence-pages.js';
import { renderQuestionsHtml } from './site/questions-page.js';
import { REPORT_CSP, REPORT_REFERRER } from './report-security.js';

// RF-800, RF-501, RF-507, RNF-003, DEC-112: the files of the published sample report, the `site/`
// folder that GitHub Pages serves from `main`. It is the report and the run replay of one run, the
// run's own documents (the specification, the cost report and the cards it links), the Markdown
// report, and an index that names the run and links the pages. The pages were written for the run
// folder, where they link `../spec.md`; in the site every document is at the root, so those links
// are rewritten to point at the file beside them. Every page is masked (RNF-003) and every address
// is relative (RF-501); the pages carry the report content security policy in a `meta` element
// (RF-1013). `.nojekyll` keeps Pages from running its own processing on the folder.

export type ReportSiteAssets = Readonly<
  Record<'report.css' | 'replay.js' | 'filters.js', string>
> & {
  /** RF-508: the vendored Mermaid build and its loader; without them the site has no diagrams page. */
  readonly diagrams?: DiagramAssets;
};

/** The run's documents keyed by their path in the run folder, which is their path in the site. */
export type SiteDocuments = Readonly<Record<string, string>>;

// RF-800, RF-507
export function buildSiteFiles(
  model: ReportModel,
  assets: ReportSiteAssets,
  masker: TextMasker,
  documents: SiteDocuments,
): Readonly<Record<string, string>> {
  // RF-508: the dashboard links the diagrams page only when the site has the build to draw them.
  const withBuild = assets.diagrams === undefined ? { ...model, diagrams: undefined } : model;
  const files: Record<string, string> = {
    '.nojekyll': '',
    'index.html': masker.mask(renderIndex(model.runKey)).text,
    'report.html': siteLinks(masker.mask(renderReportHtml(withBuild)).text),
    'questions.html': siteLinks(masker.mask(renderQuestionsHtml(model)).text),
    'cost.html': siteLinks(masker.mask(renderCostHtml(model)).text),
    'report.md': siteLinks(renderReportMarkdown(model, masker)),
    'replay.html': siteLinks(masker.mask(renderReplayHtml(model)).text),
    'replay.js': assets['replay.js'],
    'filters.js': assets['filters.js'],
    'report.css': assets['report.css'],
  };
  for (const [name, html] of Object.entries(renderEvidencePages(model))) {
    files[name] = siteLinks(masker.mask(html).text);
  }
  if (assets.diagrams !== undefined && (model.diagrams ?? []).length > 0) {
    Object.assign(files, assets.diagrams);
    files['diagrams.html'] = siteLinks(masker.mask(renderDiagramsPage(model)).text);
  }
  for (const [path, text] of Object.entries(documents)) {
    files[path] = masker.mask(text).text;
  }
  return files;
}

/** The pages link the run folder's documents as `../name`; in the site they sit beside the page. */
function siteLinks(text: string): string {
  return text.replaceAll('href="../', 'href="').replaceAll('](../', '](');
}

function renderIndex(runKey: string): string {
  const run = escapeHtml(runKey);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(REPORT_CSP)}">
<meta name="referrer" content="${REPORT_REFERRER}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rosetta sample report - ${run}</title>
<link rel="stylesheet" href="report.css">
</head>
<body>
<header class="masthead">
<p class="brand">Rosetta</p>
<p class="run">Run <span class="mono">${run}</span></p>
</header>
<main id="main">
<h1>Sample report</h1>
<p class="label">Sample run (recorded test data); the owner's demo run replaces it (DEC-105).</p>
<ul>
<li><a href="report.html">Report</a>: the specification, the cards, the coverage and the cost of the run.</li>
<li><a href="replay.html">Run replay</a>: the steps of the run in order.</li>
<li><a href="questions.html">Open questions</a>: what the run could not decide.</li>
<li><a href="cost.html">Cost</a>: what the run and its project cost.</li>
<li><a href="report.md">Markdown report</a>.</li>
</ul>
</main>
</body>
</html>
`;
}
