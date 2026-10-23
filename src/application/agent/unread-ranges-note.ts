import type { LineRange } from '../../domain/cards/area-coverage.js';
import type { DataBlockSource } from '../../domain/egress/data-block.js';

// RF-209, EV-04: the note a coverage pass task over partly read files is sent: the lines of each file
// that no earlier task read, so the reader opens those lines and not the file from its first line.
// The file names come from the repository: they only ever travel inside a data block.

/** The line ranges of one file that no task read. */
export interface UnreadRanges {
  readonly path: string;
  readonly ranges: readonly LineRange[];
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

/** The task message with the note for the request's unread ranges, when it has any (EV-04). */
export function withUnreadRanges(
  content: string,
  request: {
    readonly unreadRanges?: readonly UnreadRanges[] | undefined;
    readonly tools: { renderBlock(source: DataBlockSource, text: string): string };
  },
): string {
  const { unreadRanges, tools } = request;
  if (unreadRanges === undefined || unreadRanges.length === 0) return content;
  const note = [
    'Earlier tasks read these files only in part. The lines below were not read; read them (read_file with a start and end line) and write cards and claims for what they hold:',
    tools.renderBlock('list_area_files', listed(unreadRanges)),
  ];
  return [content, '', ...note].join('\n');
}
