// RF-626, RF-507: the HTML check a wireframe must pass. A wireframe is a plain page of layout
// boxes: no script, no event attribute, no `javascript:` address, no external resource, no style
// that loads anything, no frame, object or embed. The only link allowed is one to a sibling
// wireframe. Text from a repository or a model is escaped, so a `<` that does not start a tag the
// generator wrote is a problem in itself. Returns what is wrong, an empty list for a clean page.

const FORBIDDEN_TAGS = new Set([
  ...['script', 'iframe', 'object', 'embed', 'applet', 'frame', 'frameset'],
  ...['link', 'base', 'img', 'audio', 'video', 'source', 'track', 'form', 'input', 'svg', 'math'],
]);
const URL_ATTRIBUTES = new Set([
  ...['src', 'srcset', 'href', 'action', 'formaction', 'data', 'poster', 'ping', 'xlink:href'],
]);
const SIBLING = /^[A-Z]+-\d+\.html$/u;
const TAG =
  /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/gu;
const ATTRIBUTE = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu;
const STYLE_BAD = /url\s*\(|@import|expression\s*\(|javascript:|behavior\s*:/iu;
const SCHEME = /^\s*[a-z][a-z0-9+.-]*:/iu;
const JAVASCRIPT = /^\s*javascript:/iu;

interface Attribute {
  readonly tag: string;
  readonly name: string;
  readonly value: string;
}

const rules: readonly ((attribute: Attribute) => string | undefined)[] = [
  ({ tag, name }) => (name.startsWith('on') ? `event attribute ${name} on <${tag}>` : undefined),
  ({ name, value }) =>
    name === 'style' && STYLE_BAD.test(value) ? 'style attribute loads or runs' : undefined,
  ({ name, value }) => (JAVASCRIPT.test(value) ? `javascript: address in ${name}` : undefined),
  ({ tag, name, value }) => {
    const sibling = name === 'href' && tag === 'a' && SIBLING.test(value);
    return URL_ATTRIBUTES.has(name) && !sibling
      ? `${name}="${value}" on <${tag}> is not a link to a sibling wireframe`
      : undefined;
  },
  ({ tag, name, value }) =>
    tag === 'meta' && name === 'http-equiv' && /refresh/iu.test(value) ? 'meta refresh' : undefined,
];

/** What is wrong with one attribute of a tag. */
function problemsOf(attribute: Attribute): string[] {
  return rules.flatMap((rule) => rule(attribute) ?? []);
}

/** The attributes written in a tag, names in lower case. */
function attributesOf(tag: string, text: string): Attribute[] {
  return [...text.matchAll(ATTRIBUTE)].map((match) => ({
    ...{ tag, name: (match[1] ?? '').toLowerCase() },
    value: match[2] ?? match[3] ?? match[4] ?? '',
  }));
}

function addressProblems(attribute: Attribute): string[] {
  const free = ['content', 'class'].includes(attribute.name);
  return !free && SCHEME.test(attribute.value)
    ? [`${attribute.name} holds an address with a scheme`]
    : [];
}

function styleProblems(html: string): string[] {
  const blocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/giu)];
  return blocks.some((block) => STYLE_BAD.test(block[1] ?? ''))
    ? ['style block loads or runs']
    : [];
}

/** What is wrong with this page; an empty list for a plain page of layout boxes. */
export function htmlProblems(html: string): string[] {
  const problems: string[] = [];
  if (/<\s*script/iu.test(html)) problems.push('script');
  if (html.includes('<!--')) problems.push('comment');
  problems.push(...styleProblems(html));
  const rest = html
    .replace(/<!doctype html>/iu, '')
    .replace(TAG, (_all: string, closing: string, name: string, text: string) => {
      const tag = name.toLowerCase();
      if (FORBIDDEN_TAGS.has(tag)) problems.push(`<${tag}>`);
      if (closing === '') {
        const attributes = attributesOf(tag, text);
        problems.push(...attributes.flatMap(problemsOf), ...attributes.flatMap(addressProblems));
      }
      return '';
    });
  if (rest.includes('<')) problems.push('a < that starts no tag');
  return [...new Set(problems)];
}
