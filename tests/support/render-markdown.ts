import { marked } from 'marked';

// A real CommonMark + GFM renderer (tables, bare-URL autolinks) for the tests that prove model
// text stays text (RF-507). It is a test tool only; the app ships the Markdown files as they are.

/** Markdown to HTML with GFM on, the way a viewer such as GitHub shows a package file. */
export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { gfm: true, async: false });
}

const entities: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/** The text a reader sees: tags removed, entities decoded, white space collapsed. */
export function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => entities[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Element names that would make text live: links, images, scripts, headings, rules, code, emphasis. */
const liveElements = /<(?:a|img|script|iframe|h[1-6]|hr|pre|code|em|strong|del|input|style)[\s>/]/i;

/** The live element the HTML holds, or undefined when it holds only paragraphs, lists and tables. */
export function liveElement(html: string): string | undefined {
  return liveElements.exec(html)?.[0];
}
