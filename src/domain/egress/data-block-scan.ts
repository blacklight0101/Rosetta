import { createCitation, type Citation } from '../cards/citation.js';
import { err, ok, type Result } from '../errors/result.js';
import {
  DATA_BLOCK_CLOSE,
  DATA_BLOCK_OPEN,
  DATA_BLOCK_SOURCES,
  dataBlockFooter,
  dataBlockLabel,
  holdsDataMarker,
  holdsTag,
  isDataBlockTag,
} from './data-block.js';

// RF-142, RF-145: reads the data blocks of a message back (see data-block.ts). A block is a header
// line with the block's tag, content lines and the footer line with the same tag; lines are cut at
// `\n` only, as the marker matcher cuts them. A block ends only at the footer with its own tag.
// Anything that looks like a marker but is not a complete, valid frame is refused, and so is a
// block whose header or content holds its own tag, so content can neither close a block early nor
// forge one.

export interface DataBlockScan {
  /** How many well-formed blocks the text holds. */
  readonly blocks: number;
  /** The excerpts of every block, in order. */
  readonly excerpts: readonly Citation[];
  /** The tag of every block, in order (DEC-129: each one fresh). */
  readonly tags: readonly string[];
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

interface Header {
  readonly tag: string;
  readonly excerpts: Citation[];
}

/**
 * The tag and excerpts of a header line, or undefined when the line is not a valid header. A
 * header written by renderDataBlock is a well-formed tag and JSON that is printable ASCII with no
 * raw `<` or `>` (so no look-alike of a frame bracket either), no path with a marker look-alike
 * and no copy of the tag.
 */
function headerOf(line: string): Header | undefined {
  if (!line.startsWith(DATA_BLOCK_OPEN) || !line.endsWith(DATA_BLOCK_CLOSE)) return undefined;
  const rest = line.slice(DATA_BLOCK_OPEN.length, -DATA_BLOCK_CLOSE.length);
  const space = rest.indexOf(' ');
  const tag = rest.slice(0, Math.max(space, 0));
  const json = rest.slice(space + 1);
  if (!isDataBlockTag(tag) || holdsTag(json, tag)) return undefined;
  if (/[<>]|[^\x20-\x7E]/.test(json)) return undefined;
  const header = parseJson(json);
  if (!isRecord(header)) return undefined;
  const source = DATA_BLOCK_SOURCES.find((each) => each === header['source']);
  if (source === undefined || header['label'] !== dataBlockLabel(source)) return undefined;
  const excerpts = citationsOf(header['excerpts']);
  return excerpts === undefined ? undefined : { tag, excerpts };
}

/** The scan so far: the lines between frames wait in `pending` until a frame or the end. */
interface ScanState {
  inside: boolean;
  blocks: number;
  textOutside: boolean;
  readonly excerpts: Citation[];
  readonly tags: string[];
  readonly parts: DataBlockPart[];
  pending: string[];
  /** The excerpts of the block the scan is inside. */
  current: readonly Citation[];
  /** The tag of the block the scan is inside. */
  tag: string;
}

/** Closes the pending lines as one part; refuses a marker, or the block's own tag, in them. */
function flush(state: ScanState): boolean {
  if (state.pending.length === 0) return true;
  const text = state.pending.join('\n');
  if (holdsDataMarker(text)) return false;
  if (state.inside && holdsTag(text, state.tag)) return false;
  if (!state.inside && text.trim() !== '') state.textOutside = true;
  state.parts.push({ frame: false, text, excerpts: state.inside ? state.current : [] });
  state.pending = [];
  return true;
}

/** Takes one line; false when the text cannot be a set of well-formed blocks. */
function takeLine(state: ScanState, line: string): boolean {
  const header = state.inside ? undefined : headerOf(line);
  const footer = state.inside && line === dataBlockFooter(state.tag);
  if (header === undefined && !footer) {
    state.pending.push(line);
    return true;
  }
  if (!flush(state)) return false;
  state.parts.push({ frame: true, text: line, excerpts: [] });
  if (header !== undefined) {
    state.current = header.excerpts;
    state.tag = header.tag;
    state.tags.push(header.tag);
    state.excerpts.push(...header.excerpts);
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
    tags: [],
    parts: [],
    pending: [],
    current: [],
    tag: '',
  };
  for (const line of content.split('\n')) {
    if (!takeLine(state, line)) return err('malformed-block');
  }
  if (!flush(state) || state.inside) return err('malformed-block');
  const { blocks, excerpts, tags, textOutside, parts } = state;
  return ok({ blocks, excerpts, tags, textOutside, parts });
}
