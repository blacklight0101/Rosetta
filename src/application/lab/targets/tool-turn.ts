import { parseToolArguments, type ToolRequest } from '../../agent/tool-arguments.js';
import { isReaderToolName } from '../../agent/tool-definitions.js';
import type { LlmMessage, LlmResponse, ToolCall } from '../../ports/llm-provider.js';
import type { ToolTurn } from '../lab-turns.js';
import type { TargetOutcome } from '../lab-target.js';
import type { ReaderCase } from './reader-case.js';

// RF-1410: a reader turn that a run answers with tool calls, measured by what its calls do. Each
// count stands for what a run does with the call: `ToolRunner` answers a call made again with the
// same arguments with RST-1303 without running it (the third ends the task), the read gate counts
// only lines of a readable file of the area (RF-206), and the area's list is already in the first
// message. No model and no judge: the counts come from the calls and the case alone.

export interface TurnScope {
  /** The files the case lists; a skipped file is not readable. */
  readonly files: ReaderCase['files'];
  /** The calls the conversation made before this turn (the replayed reads). */
  readonly earlier: readonly ToolCall[];
  /** The files the prompt points to (read-more: unread, reread: cited), or null when none. */
  readonly aim: { readonly kind: 'unread' | 'cited'; readonly paths: ReadonlySet<string> } | null;
  /** The share of the area read before the turn (read-more: the refusal's), or null. */
  readonly shareBefore: number | null;
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

/** The path a call names, for a read or a code map query by path; undefined for any other. */
function pathOf(request: ToolRequest): string | undefined {
  if (request.tool === 'read_file') return request.path;
  return request.tool === 'codemap_query' && request.by === 'path' ? request.value : undefined;
}

type Counted = 'areaReads' | 'unlisted' | 'repeats' | 'relists';

/** What one valid call counts as; a repeat first, as the run answers it before running it. */
function countedAs(request: ToolRequest, repeat: boolean, readable: ReadonlySet<string>): Counted {
  if (repeat) return 'repeats';
  if (request.tool === 'list_area_files') return 'relists';
  const path = pathOf(request);
  return path !== undefined && !readable.has(path) ? 'unlisted' : 'areaReads';
}

// RF-1410
export function toolTurnOf(calls: readonly ToolCall[], scope: TurnScope): ToolTurn {
  const readable = new Set(scope.files.filter((f) => f.skipped === undefined).map((f) => f.path));
  const seenBefore = new Set(scope.earlier.map(signatureOf));
  const turn = { calls: calls.length, areaReads: 0, unlisted: 0, repeats: 0, relists: 0 };
  let aimed = 0;
  for (const call of calls) {
    const signature = signatureOf(call);
    const repeat = isReaderToolName(call.name) && seenBefore.has(signature);
    seenBefore.add(signature);
    const request = requestOf(call);
    if (request === undefined) continue;
    const counted = countedAs(request, repeat, readable);
    turn[counted] += 1;
    const isAimed = request.tool === 'read_file' && scope.aim?.paths.has(request.path) === true;
    if (counted === 'areaReads' && isAimed) aimed += 1;
  }
  const seen = calls.slice(0, MAX_SEEN).map((call) => lineOf(call, requestOf(call)));
  const lines = { searches: 0, stale: 0, newLines: 0, generatedLines: 0, shareGain: 0 };
  const aim = scope.aim === null ? null : aimed;
  return { ...turn, ...lines, shareBefore: scope.shareBefore, aimed: aim, seen };
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

function labelOf(response: LlmResponse, turn: ToolTurn): Omit<TargetOutcome, 'turn'> {
  const { toolCalls } = response;
  if (toolCalls.length === 0) {
    return { usable: false, detail: response.text.trim() === '' ? 'Empty' : 'Answered' };
  }
  if (toolCalls.some((call) => requestOf(call) === undefined)) {
    return { usable: false, detail: 'BadToolCall' };
  }
  if (turn.areaReads === 0) return { usable: false, detail: 'NoAreaRead' };
  const waste = turn.unlisted + turn.repeats + turn.relists;
  return { usable: true, detail: waste > 0 ? 'ReadsWithWaste' : 'ReadsFiles' };
}

// RF-1410
export function readerFirstTurn(response: LlmResponse, scope: TurnScope): TargetOutcome {
  const turn = toolTurnOf(response.toolCalls, scope);
  return { ...labelOf(response, turn), turn };
}
