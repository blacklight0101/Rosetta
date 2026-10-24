import type { LineRange } from '../../domain/cards/area-coverage.js';
import type { DataBlockSource } from '../../domain/egress/data-block.js';

// RF-209, EV-04: the note a coverage pass task over partly read files is sent: the lines of each file
// that no earlier task read, so the reader opens those lines and not the file from its first line.
// The file names come from the repository: they only ever travel inside a data block.

/** The line ranges of one file that no task read. */
export interface UnreadRanges {
  readonly path: string;
  readonly ranges: readonly LineRange[];
  /** P5-36: the ranges are database objects no card states, not lines no task read. */
  readonly objects?: true;
}

/** The most files, and ranges per file, a note lists; the rest are counted. */
const maxFiles = 20;
const maxRanges = 20;

function rangeText({ startLine, endLine }: LineRange): string {
  return `${String(startLine)}-${String(endLine)}`;
}

function lineOf(file: UnreadRanges): string {
  const shown = file.ranges.slice(0, maxRanges).map(rangeText);
  const more = file.ranges.length - shown.length;
  return `${file.path}:${shown.join(',')}${more > 0 ? ` and ${String(more)} more ranges` : ''}`;
}

function listed(files: readonly UnreadRanges[]): string {
  const shown = files.slice(0, maxFiles).map(lineOf);
  const more = files.length - shown.length;
  return [...shown, ...(more > 0 ? [`... and ${String(more)} more files`] : [])].join('\n');
}

/** P5-36: the note for database objects no card states, listed in a data block. */
function objectsNote(
  objects: readonly UnreadRanges[],
  tools: { renderBlock(source: DataBlockSource, text: string): string },
): string[] {
  if (objects.length === 0) return [];
  return [
    'These database objects (tables, views, procedures, triggers, functions) have no card that states what they do. Read the lines of each and write cards and claims, each citing the object lines, for:',
    '- what it reads and from where, what it writes (name every column it sets, and every flag), what it returns;',
    '- its filters and conditions (row limits such as TOP, date or month tests, joins, and what a missing row means);',
    '- casts and conversions (note when a cast shortens a value), parameters it never uses, and comparisons whose letter case or value differs from other code.',
    tools.renderBlock('list_area_files', listed(objects)),
  ];
}

/** The task message with the notes for the request's unread ranges and database objects (EV-04, P5-36). */
export function withUnreadRanges(
  content: string,
  request: {
    readonly unreadRanges?: readonly UnreadRanges[] | undefined;
    readonly tools: { renderBlock(source: DataBlockSource, text: string): string };
  },
): string {
  const { unreadRanges = [], tools } = request;
  const partly = unreadRanges.filter((each) => each.objects !== true);
  const objects = unreadRanges.filter((each) => each.objects === true);
  const note =
    partly.length === 0
      ? []
      : [
          'Earlier tasks read these files only in part. The lines below were not read; read them (read_file with a start and end line) and write cards and claims for what they hold:',
          tools.renderBlock('list_area_files', listed(partly)),
        ];
  const notes = [...note, ...objectsNote(objects, tools)];
  return notes.length === 0 ? content : [content, '', ...notes].join('\n');
}
