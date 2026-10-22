import type { DataBlockSource } from '../../domain/egress/data-block.js';
import type { ReaderToolName } from './tool-definitions.js';

// RF-208, RST-1303, EV-10: the note a reader is sent when it starts again on an area that ended
// because the model repeated a tool call. A model gives the same answer to the same prompt, so a
// retry with the prompt it had would repeat the loop; the note makes the prompt differ by naming
// the call that was repeated and the files not yet read in full. The text is built here, not in a
// prompt file (the prompt files are versioned on their own, P3-105). The call's arguments and the
// file names come from the model and the repository: they only ever travel inside data blocks.

/** The call a model made again and again, as its tool name and its arguments written as JSON. */
export interface RepeatedCall {
  readonly tool: ReaderToolName;
  readonly arguments: string;
}

export interface RetryNote {
  /** The call that was repeated, when the task that failed is known. */
  readonly repeated?: RepeatedCall;
  /** The files of the area not yet read in full, in the order to read them. */
  readonly unread: readonly string[];
}

/** The most file names a note lists; the rest are counted. */
const maxListedFiles = 20;
/** The most characters of a call's arguments a note repeats. */
const maxArgumentChars = 300;

/** The data blocks of a note: what the tools' renderer wraps. */
interface RetryNoteBlocks {
  readonly call?: string;
  readonly files?: string;
}

/** The file names, one per line, with a count of those left out. */
function listedFiles(paths: readonly string[]): string {
  const shown = paths.slice(0, maxListedFiles);
  const more = paths.length - shown.length;
  return [...shown, ...(more > 0 ? [`... and ${String(more)} more files`] : [])].join('\n');
}

/** The call as the note's data block holds it: the tool and its arguments, cut when long. */
function callText(call: RepeatedCall): string {
  const args =
    call.arguments.length > maxArgumentChars
      ? `${call.arguments.slice(0, maxArgumentChars)}...`
      : call.arguments;
  return `${call.tool} ${args}`;
}

/** The text appended to the task message of the retry; `blocks` are the data blocks it names. */
function retryNoteText(note: RetryNote, blocks: RetryNoteBlocks): string {
  const cause =
    note.repeated === undefined
      ? 'An earlier attempt at this area ended because the model repeated the same tool call.'
      : `An earlier attempt at this area ended because the model repeated the same ${note.repeated.tool} call, which gives the same result every time.`;
  const call = blocks.call === undefined ? [] : ['The call that was repeated:', blocks.call];
  const files =
    blocks.files === undefined ? [] : ['The files of the area not yet read in full:', blocks.files];
  return [
    cause,
    ...call,
    ...files,
    'This time do not repeat a call: make each call different from the ones before it, use the result of a call once you have it, read the files above that you have not read in full, and then give your final answer.',
  ].join('\n');
}

/** The note for a task message, its call and file names each inside a data block of their own. */
export function retryNoteMessage(
  note: RetryNote,
  render: (source: DataBlockSource, text: string) => string,
): string {
  const call = note.repeated === undefined ? undefined : render('cards', callText(note.repeated));
  const files =
    note.unread.length === 0 ? undefined : render('list_area_files', listedFiles(note.unread));
  return retryNoteText(note, {
    ...(call === undefined ? {} : { call }),
    ...(files === undefined ? {} : { files }),
  });
}
