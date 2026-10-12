// data-model 3.7: the YAML header of a card. Every string is written as a double-quoted scalar
// (JSON escapes are valid YAML), so model text can never add a key, a document marker or a line.
// The header is the authoritative data and is never parsed back by Rosetta.

const plainKey = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Line breaks that JSON.stringify leaves as they are but that YAML readers may treat as one.
const lineSeparators = [0x85, 0x2028, 0x2029].map((code) => String.fromCharCode(code));

function quoted(text: string): string {
  return lineSeparators.reduce(
    (escaped, char) =>
      escaped.replaceAll(char, `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`),
    JSON.stringify(text),
  );
}

function scalar(value: unknown): string | undefined {
  if (typeof value === 'string') return quoted(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return undefined;
}

function keyText(key: string): string {
  return plainKey.test(key) ? key : quoted(key);
}

function definedEntries(value: object): [string, unknown][] {
  return Object.entries(value).filter(([, item]: [string, unknown]) => item !== undefined);
}

function entryLines(key: string, value: unknown, indent: string): string[] {
  const head = `${indent}${keyText(key)}:`;
  const inline = scalar(value);
  if (inline !== undefined) return [`${head} ${inline}`];
  if (Array.isArray(value)) {
    return value.length === 0 ? [`${head} []`] : [head, ...itemLines(value, `${indent}  `)];
  }
  if (typeof value === 'object' && value !== null) {
    const inner = objectLines(value, `${indent}  `);
    return inner.length === 0 ? [`${head} {}`] : [head, ...inner];
  }
  return [`${head} null`];
}

function objectLines(value: object, indent: string): string[] {
  return definedEntries(value).flatMap(([key, item]) => entryLines(key, item, indent));
}

function itemLines(items: readonly unknown[], indent: string): string[] {
  return items.flatMap((item): string[] => {
    const inline = scalar(item);
    if (inline !== undefined) return [`${indent}- ${inline}`];
    if (Array.isArray(item)) return [`${indent}- ${JSON.stringify(item)}`];
    if (typeof item !== 'object' || item === null) return [`${indent}- null`];
    const inner = objectLines(item, `${indent}  `);
    if (inner.length === 0) return [`${indent}- {}`];
    const [first = '', ...rest] = inner;
    return [`${indent}- ${first.slice(indent.length + 2)}`, ...rest];
  });
}

/** The keys of `header` as a YAML block mapping, one key per line, without the `---` markers. */
export function renderYamlHeader(header: unknown): string {
  if (typeof header !== 'object' || header === null) return '{}';
  const lines = objectLines(header, '');
  return lines.length === 0 ? '{}' : lines.join('\n');
}
