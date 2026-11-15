import { parseToolArguments, type ToolRequest } from '../../agent/tool-arguments.js';
import { isReaderToolName } from '../../agent/tool-definitions.js';
import type { LlmMessage, LlmResponse, ToolCall } from '../../ports/llm-provider.js';
import type { ToolTurn } from '../lab-turns.js';
import type { TargetOutcome } from '../lab-target.js';
import type { ReaderCase } from './reader-case.js';
import {
  isGeneratedOrDescriptor,
  LinesRead,
  readableFilesOf,
  type ReadableFile,
  type ReadableFiles,
} from './tool-turn-reads.js';
import { isThirdPartyPath } from '../../../domain/code-map/third-party.js';

// RF-1410: a reader turn that a run answers with tool calls, graded by what its calls give the
// run's read gate. `ToolRunner` answers a call made again with the same arguments with RST-1303
// without running it (the third ends the task); the read gate counts only lines of readable files
// of the area (RF-206) and the read share grows only by new lines (Q-50); a `codemap_query` gives
// it no line and a `grep` gives the lines it matches, which the lab cannot know, so both are
// searches; the area's list is already in the first message. No model and no judge. RF-1414: a
// read-more turn has the run's line cap, so its reads are cut in call order as `ToolRunner` cuts them.

export interface TurnScope {
  /** The files the case lists; a skipped file is not readable. */
  readonly files: ReaderCase['files'];
  /** The calls the conversation made before this turn (the replayed reads). */
  readonly earlier: readonly ToolCall[];
  /** The files the prompt points to (read-more: unread, reread: cited), or null when none. */
  readonly aim: { readonly kind: 'unread' | 'cited'; readonly paths: ReadonlySet<string> } | null;
  /** The share of the area read before the turn (read-more: the refusal's), or null. */
  readonly shareBefore: number | null;
  /** RF-1414: the lines `read_file` may serve in the turn (read-more), or null for no cap. */
  readonly lineCap?: number | null;
}

const MAX_SEEN = 40;
const SEEN_CHARS = 160;

/** The key the run's `ToolRunner` compares calls by: the name and the JSON of the arguments. */
const signatureOf = (call: ToolCall): string => `${call.name}\n${JSON.stringify([call.arguments])}`;

/** The calls of the assistant turns of a conversation, in order. */
export function earlierCalls(messages: readonly LlmMessage[]): ToolCall[] {
  return messages.flatMap((message) =>
    message.role === 'assistant' ? [...(message.toolCalls ?? [])] : [],
  );
}

function requestOf(call: ToolCall): ToolRequest | undefined {
  if (!isReaderToolName(call.name)) return undefined;
  const parsed = parseToolArguments(call.name, call.arguments);
  return parsed.ok ? parsed.value : undefined;
}

function lineOf(call: ToolCall, request: ToolRequest | undefined): string {
  if (request === undefined) return `${call.name} (not valid)`.slice(0, SEEN_CHARS);
  const what = {
    list_area_files: () => '',
    read_file: () =>
      request.tool === 'read_file'
        ? ` ${request.path}:${String(request.startLine)}-${String(request.endLine)}`
        : '',
    grep: () => (request.tool === 'grep' ? ` ${request.pattern}` : ''),
    codemap_query: () => (request.tool === 'codemap_query' ? ` ${request.value}` : ''),
  }[request.tool]();
  return `${request.tool}${what}`.slice(0, SEEN_CHARS);
}

type Counted = 'areaReads' | 'searches' | 'unlisted' | 'repeats' | 'relists' | 'stale';
type Counts = Record<Counted, number> & {
  newLines: number;
  cutLines: number;
  generatedLines: number;
  shareNew: number;
  aimed: number;
};

interface LineRange {
  readonly startLine: number;
  readonly endLine: number;
}

/** The state of one turn's counting: the files, the lines read so far and the counts. */
interface Tally {
  readonly files: ReadableFiles;
  readonly read: LinesRead;
  readonly aim: ReadonlySet<string> | null;
  readonly counts: Counts;
  /** RF-1414: the lines `read_file` may still serve in the turn, or null for no cap. */
  readonly cap: { left: number } | null;
}

/** Counts one read of a readable file: its new lines, and whether it is an area read or stale. */
function countRead(tally: Tally, file: ReadableFile, request: LineRange) {
  const { counts } = tally;
  const covered = LinesRead.covered(request.startLine, request.endLine, file.lines);
  const fresh = tally.read.add(file.path, request.startLine, request.endLine, file.lines);
  counts.newLines += fresh;
  if (isGeneratedOrDescriptor(file.path)) counts.generatedLines += fresh;
  if (!isThirdPartyPath(file.path)) counts.shareNew += fresh;
  if (fresh * 2 <= covered) {
    counts.stale += 1;
    return;
  }
  counts.areaReads += 1;
  if (tally.aim?.has(file.path.toLowerCase()) === true) counts.aimed += 1;
}

/** RF-1414: a read as the cap lets it through: what it covers, and the call the run sends, if any. */
interface CappedRead {
  readonly range: LineRange;
  /** The lines the run asks the tool for (`ToolRunner`), or null when the cap refused the read. */
  readonly sent: LineRange | null;
}

/** RF-1414: the part of a read the cap lets through (an empty range when none is left). */
function withinCap(tally: Tally, file: ReadableFile, request: LineRange): CappedRead {
  const { cap } = tally;
  if (cap === null) return { range: request, sent: request };
  const left = cap.left;
  const served = LinesRead.covered(request.startLine, request.endLine, file.lines);
  const allowed = Math.min(served, left);
  cap.left -= allowed;
  tally.counts.cutLines += served - allowed;
  const range = { startLine: request.startLine, endLine: request.startLine + allowed - 1 };
  if (left <= 0) return { range, sent: null };
  const cut = request.endLine - request.startLine + 1 > left;
  return { range, sent: cut ? { ...request, endLine: request.startLine + left - 1 } : request };
}

/**
 * RF-1414: the key the run remembers a read by, as `ToolRunner` does: the call when it ran whole,
 * the lines it asked for when the cap cut it, and nothing when the cap refused it.
 */
function remembered(call: ToolCall, request: ToolRequest, sent: LineRange | null): string | null {
  if (request.tool !== 'read_file' || sent?.endLine === request.endLine) return signatureOf(call);
  if (sent === null) return null;
  const asked = { path: request.path, startLine: sent.startLine, endLine: sent.endLine };
  return signatureOf({ ...call, arguments: asked });
}

/**
 * What one valid call counts as, a repeat first, as the run answers it before running it; returns
 * the key the run remembers the call by, or null when the cap refused it (RF-1414).
 */
function countCall(
  tally: Tally,
  call: ToolCall,
  request: ToolRequest,
  repeat: boolean,
): string | null {
  const { counts, files } = tally;
  const key = signatureOf(call);
  if (repeat) counts.repeats += 1;
  else if (request.tool === 'list_area_files') counts.relists += 1;
  else if (request.tool === 'grep') counts.searches += 1;
  else if (request.tool === 'codemap_query') {
    const known = request.by === 'symbol' || files.resolve(request.value) !== undefined;
    counts[known ? 'searches' : 'unlisted'] += 1;
  } else {
    const file = files.resolve(request.path);
    if (file === undefined) {
      counts.unlisted += 1;
      return key;
    }
    const capped = withinCap(tally, file, request);
    countRead(tally, file, capped.range);
    return remembered(call, request, capped.sent);
  }
  return key;
}

function tallyOf(scope: TurnScope): Tally {
  const files = readableFilesOf(scope.files);
  const read = new LinesRead();
  for (const call of scope.earlier) {
    const request = requestOf(call);
    const file = request?.tool === 'read_file' ? files.resolve(request.path) : undefined;
    if (request?.tool === 'read_file' && file !== undefined) {
      read.add(file.path, request.startLine, request.endLine, file.lines);
    }
  }
  const aim =
    scope.aim === null ? null : new Set([...scope.aim.paths].map((path) => path.toLowerCase()));
  const counts: Counts = {
    ...{ areaReads: 0, searches: 0, unlisted: 0, repeats: 0, relists: 0, stale: 0 },
    ...{ newLines: 0, cutLines: 0, generatedLines: 0, shareNew: 0, aimed: 0 },
  };
  const cap =
    scope.lineCap === undefined || scope.lineCap === null ? null : { left: scope.lineCap };
  return { files, read, aim, counts, cap };
}

// RF-1410
export function toolTurnOf(calls: readonly ToolCall[], scope: TurnScope): ToolTurn {
  const tally = tallyOf(scope);
  const seenBefore = new Set(scope.earlier.map(signatureOf));
  for (const call of calls) {
    const signature = signatureOf(call);
    const repeat = isReaderToolName(call.name) && seenBefore.has(signature);
    const request = requestOf(call);
    const key = request === undefined ? signature : countCall(tally, call, request, repeat);
    if (key !== null) seenBefore.add(key);
  }
  const { shareNew, aimed, ...counts } = tally.counts;
  const { shareLines } = tally.files;
  return {
    ...{ calls: calls.length, ...counts, shareBefore: scope.shareBefore },
    shareGain: shareLines === 0 ? 0 : shareNew / shareLines,
    aimed: scope.aim === null ? null : aimed,
    seen: calls.slice(0, MAX_SEEN).map((call) => lineOf(call, requestOf(call))),
  };
}

const CITED_PATH = /^(.+):\d+-\d+$/u;

function citationsOf(claim: unknown): string[] {
  if (typeof claim !== 'object' || claim === null || !('citations' in claim)) return [];
  const { citations } = claim;
  return Array.isArray(citations)
    ? citations.filter((each): each is string => typeof each === 'string')
    : [];
}

/** The paths the claims of a rejected block cite; none when the text is not that JSON. */
// RF-1410
export function citedPaths(rejected: string): ReadonlySet<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rejected);
  } catch {
    return new Set();
  }
  const claims =
    typeof parsed === 'object' && parsed !== null && 'rejected' in parsed ? parsed.rejected : [];
  const cited = (Array.isArray(claims) ? claims : []).flatMap(citationsOf);
  return new Set(cited.flatMap((citation) => CITED_PATH.exec(citation)?.[1] ?? []));
}

type Label = Omit<TargetOutcome, 'turn'>;

/** The labels of a turn whose calls are all valid, the first that applies (RF-1410). */
function readsLabelOf(turn: ToolTurn, scope: TurnScope): Label {
  if (turn.areaReads === 0) return { usable: false, detail: 'NoAreaRead' };
  if (scope.aim?.kind === 'cited' && turn.aimed === 0) {
    return { usable: false, detail: 'MissesCited' };
  }
  const plain = readableFilesOf(scope.files).hasPlainFile;
  if (plain && turn.newLines > 0 && turn.generatedLines === turn.newLines) {
    return { usable: false, detail: 'GeneratedOnly' };
  }
  const waste = turn.stale + turn.unlisted + turn.repeats + turn.relists;
  return { usable: true, detail: waste > 0 ? 'ReadsWithWaste' : 'ReadsFiles' };
}

function labelOf(response: LlmResponse, turn: ToolTurn, scope: TurnScope): Label {
  const { toolCalls } = response;
  if (toolCalls.length === 0) {
    return { usable: false, detail: response.text.trim() === '' ? 'Empty' : 'Answered' };
  }
  if (toolCalls.some((call) => requestOf(call) === undefined)) {
    return { usable: false, detail: 'BadToolCall' };
  }
  return readsLabelOf(turn, scope);
}

// RF-1410
export function readerFirstTurn(response: LlmResponse, scope: TurnScope): TargetOutcome {
  const turn = toolTurnOf(response.toolCalls, scope);
  return { ...labelOf(response, turn, scope), turn };
}
