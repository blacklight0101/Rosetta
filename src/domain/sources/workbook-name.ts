import { err, ok, type Result } from '../errors/result.js';
import { baseNameOf, decoded, isHighSurrogate } from './upload-name.js';

// RF-150, RF-158: the name a workbook is recorded under, and the line that stands for all the
// workbooks of a project in its source columns.

const MAX_NAME = 200;
const MAX_EXTENSION = 8;
const ELLIPSIS = '...';

/** At most 200 characters, keeping a short extension; a surrogate pair is kept whole or dropped whole. */
function cut(name: string): string {
  if (name.length <= MAX_NAME) return name;
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 && name.length - dot <= MAX_EXTENSION ? name.slice(dot) : '';
  let keep = MAX_NAME - extension.length;
  if (isHighSurrogate(name.charCodeAt(keep - 1))) keep -= 1;
  return `${name.slice(0, keep)}${extension}`;
}

/**
 * The file name to record: the one the page sent (percent-encoded, a base name, no control or bidi
 * characters, at most 200 characters). Whether it names a workbook is for the reader to judge
 * (RF-151). A request without a name or with only a path is `missing`.
 */
// RF-150
export function workbookFileName(
  sent: string | undefined,
): Result<string, 'missing' | 'bad-encoding'> {
  if (sent === undefined) return err('missing');
  const text = decoded(sent);
  if (text === undefined) return err('bad-encoding');
  const name = baseNameOf(text);
  return name === '' ? err('missing') : ok(cut(name));
}

/** The names of a project's workbooks, joined by commas and cut to 200 characters, for its source columns. */
// RF-150
export function workbookSourceName(names: readonly string[]): string {
  const line = names.join(', ');
  if (line.length <= MAX_NAME) return line;
  let keep = MAX_NAME - ELLIPSIS.length;
  if (isHighSurrogate(line.charCodeAt(keep - 1))) keep -= 1;
  return `${line.slice(0, keep)}${ELLIPSIS}`;
}
