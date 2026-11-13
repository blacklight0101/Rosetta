// RF-1407: the inputs of a case as the text the judge reads in the `lab_source` block. Strings with
// line breaks are written as they are (code stays code), everything else as indented key lines.

const MAX_SOURCE_CHARS = 14_000;
const CUT = '\n[cut: the source is longer than the judge is given]';

function lines(value: unknown, indent: string): string[] {
  if (typeof value === 'string') {
    return value.includes('\n')
      ? [`${indent}|`, ...value.split('\n').map((line) => `${indent}  ${line}`)]
      : [`${indent}${value}`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((each: unknown) => {
      const [first = '', ...rest] = lines(each, `${indent}  `);
      return [`${indent}-${first.slice(indent.length + 1)}`, ...rest];
    });
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, each]) => {
      const inner = lines(each, `${indent}  `);
      const scalar = typeof each !== 'object' && !(typeof each === 'string' && each.includes('\n'));
      return scalar
        ? [`${indent}${key}: ${inner.join('').trim()}`]
        : [`${indent}${key}:`, ...inner];
    });
  }
  return [`${indent}${JSON.stringify(value)}`];
}

// RF-1407
export function sourceText(input: unknown): string {
  const text = lines(input, '').join('\n');
  return text.length <= MAX_SOURCE_CHARS ? text : `${text.slice(0, MAX_SOURCE_CHARS)}${CUT}`;
}
