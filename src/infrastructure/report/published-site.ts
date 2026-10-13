import type { ReportModel } from '../../application/report/report-model.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { escapeHtml } from './html-text.js';
import { renderReplayHtml } from './replay-html.js';
import { renderReportHtml } from './report-html.js';
import { REPORT_CSP, REPORT_REFERRER } from './report-security.js';

// RF-800, RF-501, RF-507, RNF-003, DEC-112: the files of the published sample report, the `site/`
// folder that GitHub Pages serves from `main`. It is the report and the run replay of one run, the
// same pages the report writer makes for a run folder, plus an index that names the run and links
// both pages. Every page is masked (RNF-003), every address is relative (RF-501) and the pages carry
// the report content security policy in a `meta` element (RF-1013). `.nojekyll` keeps Pages from
// running its own processing on the folder.

export type ReportSiteAssets = Readonly<Record<'report.css' | 'replay.js', string>>;

export type IndexCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

// RF-800, RF-507
export function buildSiteFiles(
  model: ReportModel,
  assets: ReportSiteAssets,
  masker: TextMasker,
): Readonly<Record<string, string>> {
  return {
    '.nojekyll': '',
    'index.html': masker.mask(renderIndex(model.runKey)).text,
    'report.html': masker.mask(renderReportHtml(model)).text,
    'replay.html': masker.mask(renderReplayHtml(model)).text,
    'replay.js': assets['replay.js'],
    'report.css': assets['report.css'],
  };
}

// RF-800: the index names the run, which the Pages smoke step looks for after the deployment.
export function checkPublishedIndex(html: string, runKey: string): IndexCheck {
  if (html.trim() === '') return { ok: false, reason: 'The index page is empty.' };
  if (!html.includes(`<span class="mono">${escapeHtml(runKey)}</span>`)) {
    return { ok: false, reason: `The index page does not show run ${runKey}.` };
  }
  return { ok: true };
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
<p>This sample is made from recorded data of a demo repository. It is not a live analysis.</p>
<ul>
<li><a href="report.html">Report</a>: the specification, the cards, the coverage and the cost of the run.</li>
<li><a href="replay.html">Run replay</a>: the steps of the run in order.</li>
</ul>
</main>
</body>
</html>
`;
}
