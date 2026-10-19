// RF-507, ADR-013: text from a repository or a model is put into a page as text, never as markup.

const entities: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// NUL and the other C0 controls (tab, line feed and carriage return stay), DEL, and the bidi
// controls that reorder the text around them.
// eslint-disable-next-line no-control-regex -- the point is to find control characters in text
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu;

/**
 * The text with `& < > " '` replaced by entities, safe in element text and in quoted attributes,
 * and without NUL and bidi controls.
 */
// RF-507
export function escapeHtml(text: string): string {
  return text
    .replace(INVISIBLE, '')
    .replace(/[&<>"']/g, (character) => entities[character] ?? character);
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

const EXTERNAL_ANCHOR = /<a href="(https?:[^"]*)"[^>]*>([^<]*)<\/a>/gu;

/**
 * RF-131: the page of an uploaded project keeps no link to another site. A link that model text
 * quoted from the code shows as the Markdown it was, `[label](address)`, as text.
 */
// RF-131
export function withoutExternalLinks(html: string): string {
  return html.replace(
    EXTERNAL_ANCHOR,
    (_whole, address: string, label: string) => `[${label}](${address})`,
  );
}

const MARKDOWN_LINK = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/gu;

/** A piece of model text: plain text, or a Markdown link whose address is a github.com one. */
export type ModelTextPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'link'; readonly label: string; readonly address: string };

/**
 * Model text in pieces: a Markdown link `[label](address)` is a link only when the address is an
 * `https://github.com/` one; any other stays in the text it was, character for character (RF-507).
 */
// RF-507
export function modelTextParts(text: string): ModelTextPart[] {
  const parts: ModelTextPart[] = [];
  let from = 0;
  let plain = '';
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const [whole = '', label = '', address = ''] = match;
    plain += text.slice(from, match.index);
    from = match.index + whole.length;
    if (!isGitHubLink(address)) {
      plain += whole;
      continue;
    }
    if (plain !== '') parts.push({ kind: 'text', text: plain });
    plain = '';
    parts.push({ kind: 'link', label, address });
  }
  plain += text.slice(from);
  if (plain !== '') parts.push({ kind: 'text', text: plain });
  return parts;
}

/** Model text as HTML: every character shown as text, a github.com Markdown link as a link. */
// RF-507
export function renderModelText(text: string): string {
  return modelTextParts(text)
    .map((part) =>
      part.kind === 'text'
        ? escapeHtml(part.text)
        : `<a href="${escapeHtml(part.address)}" rel="noopener noreferrer nofollow">${escapeHtml(part.label)}</a>`,
    )
    .join('');
}
