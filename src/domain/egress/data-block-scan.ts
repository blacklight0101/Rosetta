import { createCitation, type Citation } from '../cards/citation.js';
import { err, ok, type Result } from '../errors/result.js';
import {
  DATA_BLOCK_CLOSE,
  DATA_BLOCK_FOOTER,
  DATA_BLOCK_LABEL,
  DATA_BLOCK_OPEN,
  DATA_BLOCK_SOURCES,
  holdsDataMarker,
} from './data-block.js';

// RF-142, RF-145: reads the data blocks of a message back (see data-block.ts). A block is a header
// line, content lines and a footer line. Anything that looks like a marker but is not a complete,
// valid frame is refused, so content can neither close a block early nor forge one.

export interface DataBlockScan {
  /** How many well-formed blocks the text holds. */
  readonly blocks: number;
  /** The excerpts of every block, in order. */
  readonly excerpts: readonly Citation[];
  /** Whether any non-blank text stands outside the blocks. */
  readonly textOutside: boolean;
  /**
   * The text cut at the header and footer lines: joined with line breaks they give the content
   * back. The text between frames is masked as one piece, so a secret pattern never eats a frame.
   */
  readonly parts: readonly DataBlockPart[];
}

interface DataBlockPart {
  /** A header or footer line. */
  readonly frame: boolean;
  readonly text: string;
  /** The excerpts of the block the text stands in; empty for a frame or text outside blocks. */
  readonly excerpts: readonly Citation[];
}

export type DataBlockProblem = 'malformed-block';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function citationOf(value: unknown): Citation | undefined {
  if (!isRecord(value)) return undefined;
  const { path, startLine, endLine } = value;
  if (typeof path !== 'string' || holdsDataMarker(path)) return undefined;
  if (typeof startLine !== 'number' || typeof endLine !== 'number') return undefined;
  const citation = createCitation(path, startLine, endLine);
  return citation.ok ? citation.value : undefined;
}

function citationsOf(value: unknown): Citation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const citations: Citation[] = [];
  for (const item of value) {
    const citation = citationOf(item);
    if (citation === undefined) return undefined;
    citations.push(citation);
  }
  return citations;
}

/**
 * The excerpts of a header line, or undefined when the line is not a valid header. A header
 * written by renderDataBlock is printable ASCII with no raw `<` or `>` (so no look-alike of a
 * frame bracket either) and no path with a marker look-alike.
 */
function headerExcerpts(line: string): Citation[] | undefined {
  if (!line.startsWith(DATA_BLOCK_OPEN) || !line.endsWith(DATA_BLOCK_CLOSE)) return undefined;
  const json = line.slice(DATA_BLOCK_OPEN.length, -DATA_BLOCK_CLOSE.length);
  if (/[<>]|[^\x20-\x7E]/.test(json)) return undefined;
  const header = parseJson(json);
  if (!isRecord(header) || header['label'] !== DATA_BLOCK_LABEL) return undefined;
  const known = DATA_BLOCK_SOURCES.some((source) => source === header['source']);
  return known ? citationsOf(header['excerpts']) : undefined;
}

/** The scan so far: the lines between frames wait in `pending` until a frame or the end. */
interface ScanState {
  inside: boolean;
  blocks: number;
  textOutside: boolean;
  readonly excerpts: Citation[];
  readonly parts: DataBlockPart[];
  pending: string[];
  /** The excerpts of the block the scan is inside. */
  current: readonly Citation[];
}

/** Closes the pending lines as one part; refuses a marker in them. */
function flush(state: ScanState): boolean {
  if (state.pending.length === 0) return true;
  const text = state.pending.join('\n');
  if (holdsDataMarker(text)) return false;
  if (!state.inside && text.trim() !== '') state.textOutside = true;
  state.parts.push({ frame: false, text, excerpts: state.inside ? state.current : [] });
  state.pending = [];
  return true;
}

/** Takes one line; false when the text cannot be a set of well-formed blocks. */
function takeLine(state: ScanState, line: string): boolean {
  const excerpts = state.inside ? undefined : headerExcerpts(line);
  const footer = state.inside && line === DATA_BLOCK_FOOTER;
  if (excerpts === undefined && !footer) {
    state.pending.push(line);
    return true;
  }
  if (!flush(state)) return false;
  state.parts.push({ frame: true, text: line, excerpts: [] });
  if (excerpts !== undefined) {
    state.current = excerpts;
    state.excerpts.push(...excerpts);
    state.blocks += 1;
  }
  state.inside = !state.inside;
  return true;
}

// RF-145
export function scanDataBlocks(content: string): Result<DataBlockScan, DataBlockProblem> {
  const state: ScanState = {
    inside: false,
    blocks: 0,
    textOutside: false,
    excerpts: [],
    parts: [],
    pending: [],
    current: [],
  };
  for (const line of content.split('\n')) {
    if (!takeLine(state, line)) return err('malformed-block');
  }
  if (!flush(state) || state.inside) return err('malformed-block');
  const { blocks, excerpts, textOutside, parts } = state;
  return ok({ blocks, excerpts, textOutside, parts });
}
