// RF-507, ADR-013: text from a repository or a model is put into a page as text, never as markup.

const entities: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** The text with `& < > " '` replaced by entities, safe in element text and in quoted attributes. */
// RF-507
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

const GITHUB_PREFIX = 'https://github.com/';

/** Whether the address is an `https://github.com/` link and nothing else (RF-507). */
// RF-507
export function isGitHubLink(address: string): boolean {
  if (!address.startsWith(GITHUB_PREFIX)) return false;
  try {
    const url = new URL(address);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.username === '' &&
      url.password === '' &&
      url.port === ''
    );
  } catch {
    // An address the URL parser refuses is not a link to keep.
    return false;
  }
}

const MARKDOWN_LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/gu;

/**
 * Model text as HTML: every character shown as text; a Markdown link `[label](address)` stays a
 * link only when the address is an `https://github.com/` one, any other is shown as the text it was.
 */
// RF-507
export function renderModelText(text: string): string {
  let html = '';
  let from = 0;
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const [whole = '', label = '', address = ''] = match;
    html += escapeHtml(text.slice(from, match.index));
    html += isGitHubLink(address)
      ? `<a href="${escapeHtml(address)}" rel="noopener noreferrer nofollow">${escapeHtml(label)}</a>`
      : escapeHtml(whole);
    from = match.index + whole.length;
  }
  return html + escapeHtml(text.slice(from));
}
