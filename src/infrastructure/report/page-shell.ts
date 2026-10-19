import { escapeHtml, withoutExternalLinks } from './html-text.js';
import { REPORT_CSP, REPORT_REFERRER } from './report-security.js';

// RF-1013, RF-507, DEC-112: the frame every static report page shares. The content security policy
// and the referrer policy come first, in `meta` elements, because a published copy has no server to
// send headers; the stylesheet and the one script are files of the report folder, so the policy
// needs no inline allowance. The pages work from a folder on disk and on GitHub Pages: every
// address is relative.

type ReportPage = 'report' | 'questions' | 'replay' | 'cost' | 'area' | 'card' | 'diagrams';

export interface PageContent {
  readonly page: ReportPage;
  readonly runKey: string;
  readonly title: string;
  /** The markup of the page body; the caller has escaped everything in it. */
  readonly main: string;
  /** The scripts of the report folder to load deferred, in this order (file names); none by default. */
  readonly scripts?: readonly string[];
  /** RF-131: the run is on an uploaded zip; no link to another site stays in the page. */
  readonly upload?: boolean;
}

const NAVIGATION: readonly {
  readonly page: ReportPage;
  readonly href: string;
  readonly name: string;
}[] = [
  { page: 'report', href: 'report.html', name: 'Dashboard' },
  { page: 'questions', href: 'questions.html', name: 'Open questions' },
  { page: 'replay', href: 'replay.html', name: 'Run replay' },
  { page: 'cost', href: 'cost.html', name: 'Cost' },
];

function navigation(current: ReportPage): string {
  const links = NAVIGATION.map((item) => {
    const mark = item.page === current ? ' aria-current="page"' : '';
    return `<a href="${item.href}"${mark}>${item.name}</a>`;
  });
  return `<nav class="tabs" aria-label="Report pages">${links.join('\n')}</nav>`;
}

// RF-1013, RF-507
export function renderPage(content: PageContent): string {
  const scripts = (content.scripts ?? [])
    .map((name) => `\n<script src="${escapeHtml(name)}" defer></script>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(REPORT_CSP)}">
<meta name="referrer" content="${REPORT_REFERRER}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(content.title)} - ${escapeHtml(content.runKey)}</title>
<link rel="stylesheet" href="report.css">${scripts}
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<header class="masthead">
<p class="brand">Rosetta</p>
<p class="run">Run <span class="mono">${escapeHtml(content.runKey)}</span></p>
</header>
${navigation(content.page)}
<main id="main">
${content.upload === true ? withoutExternalLinks(content.main) : content.main}
</main>
</body>
</html>
`;
}
