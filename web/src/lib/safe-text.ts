// RF-507 rule 2, ADR-013: repository and model text is rendered as text. Inside it, only
// https://github.com/ links stay links; any other scheme or host is shown as plain text. Raw HTML
// is never interpreted here: the parts are plain strings that the view puts in text nodes.

export type TextPart =
  | { readonly kind: 'text'; readonly text: string }
  /** `inline code` between single backticks; the backticks are not part of the text. */
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'link'; readonly href: string; readonly label: string };

const githubPrefix = 'https://github.com/';
/** Text between single backticks on one line. */
const codePattern = /`([^`\n]+)`/gu;
/** `[label](url)` or a bare http(s) URL; a bare URL ends before whitespace, quotes and brackets. */
const linkPattern = /\[([^\]\n]*)\]\(([^)\s]*)\)|https?:\/\/[^\s<>"'`)\]]+/giu;
const trailingPunctuation = /[.,;:!?]+$/u;

/** The normalised address when `raw` is an https://github.com/ link, else undefined. */
function githubHref(raw: string): string | undefined {
  if (!raw.startsWith(githubPrefix)) return undefined;
  try {
    const url = new URL(raw);
    const plain =
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '';
    return plain ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function pushText(parts: TextPart[], text: string): void {
  if (text === '') return;
  const last = parts.at(-1);
  if (last?.kind === 'text') parts[parts.length - 1] = { kind: 'text', text: last.text + text };
  else parts.push({ kind: 'text', text });
}

/** One match: a link part (plus trailing punctuation as text) or the matched source as text. */
function partsOfMatch(match: RegExpExecArray): TextPart[] {
  const [source = '', label, target] = match;
  if (target !== undefined) {
    const href = githubHref(target);
    return href === undefined
      ? [{ kind: 'text', text: source }]
      : [{ kind: 'link', href, label: label === undefined || label === '' ? href : label }];
  }
  const punctuation = trailingPunctuation.exec(source)?.[0] ?? '';
  const url = source.slice(0, source.length - punctuation.length);
  const href = githubHref(url);
  if (href === undefined) return [{ kind: 'text', text: source }];
  const parts: TextPart[] = [{ kind: 'link', href, label: url }];
  if (punctuation !== '') parts.push({ kind: 'text', text: punctuation });
  return parts;
}

/** The links of a stretch of text outside any code span. */
function linkParts(text: string): readonly TextPart[] {
  const parts: TextPart[] = [];
  let end = 0;
  for (const match of text.matchAll(linkPattern)) {
    pushText(parts, text.slice(end, match.index));
    for (const part of partsOfMatch(match)) {
      if (part.kind === 'text') pushText(parts, part.text);
      else parts.push(part);
    }
    end = match.index + match[0].length;
  }
  pushText(parts, text.slice(end));
  return parts;
}

// RF-507
export function splitText(text: string): readonly TextPart[] {
  const parts: TextPart[] = [];
  let end = 0;
  for (const match of text.matchAll(codePattern)) {
    parts.push(...linkParts(text.slice(end, match.index)));
    parts.push({ kind: 'code', text: match[1] ?? '' });
    end = match.index + match[0].length;
  }
  parts.push(...linkParts(text.slice(end)));
  return parts;
}
