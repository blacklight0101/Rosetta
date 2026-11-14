import { err, ok, type Result } from '../../../domain/errors/result.js';
import { joinFragment } from '../../agent/cut-answer.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import {
  readerPromptsFor,
  readerSystemPrompt,
  readerTaskMessage,
  type ReaderPrompts,
} from '../../agent/reader-prompts.js';
import { readerToolDefinitions } from '../../agent/tool-definitions.js';
import { readCutCards } from '../../cards/cut-cards.js';
import { parseCardsLenient } from '../../cards/parse-cards.js';
import type { LlmMessage, LlmResponse } from '../../ports/llm-provider.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';
import {
  areaBlock,
  onLastTurn,
  readerCaseSchema,
  replayOfReads,
  type ReaderCase,
} from './reader-case.js';
import { cardsOutcome } from './reader-targets.js';
import { askOnce, problemsOf } from './single-call.js';

// RF-1406, ADR-029: the lab targets of the card prompts that are not the card format. A case
// is a reader case with reads; the turn is the one after the replay of the reads, on the last turn
// (one turn left), read by the run's card parser (`Valid`, `Partial`, `Unusable`, `ReadsMore`). A
// fragment call carries no tools, so it is the answer; a real run keeps its tools on the last turn
// (agent-loop.ts) and the lab drops them on purpose (P10-09):
//   cards/flows, cards/screens  the fragment under test is added after the card format of the system
//                               prompt, for an area marked for it, and the other fragment is left out
//   cards/continue              the turn after a cut answer made from the first read and the continue
//                               file under test; the fragment the model sends is joined to the cut
//                               answer as the run joins it

/**
 * The answer cut off in the continue case: the start of a card about the first read of the case, cut
 * inside its claim. It is made from the case's path and lines, never from a model's answer, so the
 * model can finish it from what it has read (a cut about unread code is refused as ungrounded).
 */
function cutOf(input: ReaderCase): string {
  const read = input.reads?.[0];
  if (read === undefined) return '';
  const last = read.startLine + read.lines.length - 1;
  const name = read.path.split('/').at(-1) ?? read.path;
  const lines = `${String(read.startLine)}-${String(last)}`;
  const claim = JSON.stringify(`The file ${read.path} holds the code at lines ${lines}, which is`);
  const fields = [
    ...['"type": "FEAT"', `"title": ${JSON.stringify(`Reads ${name}`)}`],
    ...[
      `"area": ${JSON.stringify(input.area)}`,
      `"summary": ${JSON.stringify(`The code in ${read.path} is read here.`)}`,
    ],
    ...['"confidence": "High"', `"claims": [{"text": ${claim.slice(0, -1)}`],
  ];
  return `{"cards": [{${fields.join(', ')}`;
}

/** The cut of a stand-in case: first-try validity reads the fragment alone, and every cut has this shape. */
const STAND_IN = cutOf({
  ...{ area: 'a', files: [{ path: 'a.cs', language: 'csharp' }], turns: 2 },
  reads: [{ path: 'a.cs', startLine: 1, lines: ['x'] }],
});

/** The text of the claim the cut stops inside: a finished card starts its first claim with it. */
function claimStartOf(cut: string): string {
  const marker = '"text": "';
  const start = cut.lastIndexOf(marker) + marker.length;
  return String(JSON.parse(`"${cut.slice(start)}"`));
}

/**
 * Whether the joined answer finished the cut card: its first card, read as the run reads it (or, for
 * an answer cut again, the cards finished before that cut), has the cut's first claim. A model that
 * starts a new answer (often after a line of prose or inside a fence) does not.
 */
function continues(cut: string, joinedText: string): boolean {
  const whole = parseCardsLenient(joinedText);
  const read = whole.drafts.length > 0 ? whole : readCutCards(joinedText);
  return read?.drafts[0]?.claims[0]?.text.startsWith(claimStartOf(cut)) === true;
}

/** The files the case read that no claim of the joined answer cites: cards that were still to come. */
function uncitedPaths(input: ReaderCase, joinedText: string): string[] {
  const cited = new Set(
    parseCardsLenient(joinedText).drafts.flatMap((draft) =>
      draft.claims.flatMap((claim) => claim.citations.map((citation) => citation.path)),
    ),
  );
  return [...new Set((input.reads ?? []).map((read) => read.path))].filter(
    (path) => !cited.has(path),
  );
}

/**
 * A joined answer the run could read: usable only when it finished the cut card (`Restarted`) and,
 * read whole, still cites every file the case read (`Uncovered`): a run keeps only what the
 * continuation writes, so a continuation that stops after the cut card loses the cards to come.
 */
function continuation(
  input: ReaderCase,
  response: LlmResponse,
  prompts: ReaderPrompts,
): TargetOutcome {
  const cut = cutOf(input);
  const joinedResponse = joined(cut, response);
  const outcome = cardsOutcome(joinedResponse, prompts);
  const finished = continues(cut, joinedResponse.text);
  if (outcome.usable && finished) {
    const lost = uncitedPaths(input, joinedResponse.text).length > 0;
    return lost ? { usable: false, detail: 'Uncovered' } : outcome;
  }
  if (outcome.usable) return { usable: false, detail: 'Restarted' };
  // Cut again at the output limit after finishing the card: a run asks again and keeps these cards.
  return finished && outcome.detail === 'Unusable' ? { usable: true, detail: 'Partial' } : outcome;
}

/** The turns of the case in a continue replay: the message says two are left. */
const CONTINUE_TURNS = 3;

type Part = 'flows' | 'screens' | 'continue';

const needsReads = 'a case for this prompt needs reads';

function promptsOf(part: Part, current: ReaderPrompts, file: PromptFile): ReaderPrompts {
  if (part === 'continue') return { ...current, continue: file };
  const own = current.surface ?? { flows: file, screens: file };
  const tested = { ...current, surface: { ...own, [part]: file } };
  return readerPromptsFor(tested, { flows: part === 'flows', screens: part === 'screens' });
}

function messagesOf(part: Part, input: ReaderCase, prompts: ReaderPrompts, env: TargetEnv) {
  const tag = (): string => env.ids.dataBlockTag();
  const task: LlmMessage = {
    role: 'user',
    content: readerTaskMessage(prompts, areaBlock(input, tag())),
  };
  // A continuation is a turn of its own (Q-55), so the answer it follows was not the last one.
  const turned = part === 'continue' ? { ...input, turns: CONTINUE_TURNS } : onLastTurn(input);
  const replay = replayOfReads(turned, prompts, tag);
  if (part !== 'continue') return [task, ...replay];
  const more: LlmMessage = { role: 'user', content: prompts.continue.text.trimEnd() };
  return [task, ...replay, { role: 'assistant' as const, content: cutOf(input) }, more];
}

/** The fragment of a continuation, joined to the cut answer as the run joins it, read as an answer. */
function joined(cut: string, response: LlmResponse): LlmResponse {
  return { ...response, text: joinFragment(cut, response.text) };
}

function preparedOf(part: Part, input: ReaderCase, current: ReaderPrompts): PreparedCase {
  return {
    run: async (env: TargetEnv, file: PromptFile): Promise<TargetOutcome> => {
      const prompts = promptsOf(part, current, file);
      const system = readerSystemPrompt(part === 'continue' ? current : prompts);
      const asked = await askOnce(env, {
        ...{ role: 'reader', task: 'reader-lab', system },
        ...{ messages: messagesOf(part, input, prompts, env) },
        // A fragment is the answer of the last turn and carries no tools; a continuation keeps the
        // run's tools, which a run ignores, so a tool call there leaves the answer cut (P10-09).
        tools: part === 'continue' ? readerToolDefinitions : [],
      });
      if (!asked.ok) return asked.error;
      if (part === 'continue') return continuation(input, asked.value, prompts);
      return cardsOutcome(asked.value, prompts);
    },
  };
}

function targetOf(id: string, part: Part, current: ReaderPrompts): LabTarget {
  return {
    id,
    role: 'reader',
    parseInput: (data): Result<PreparedCase, string> => {
      const parsed = readerCaseSchema.safeParse(data);
      if (!parsed.success) return err(problemsOf(parsed.error.issues));
      if ((parsed.data.reads ?? []).length === 0) return err(needsReads);
      return ok(preparedOf(part, parsed.data, current));
    },
    readsAnswer: (text) => {
      const answer = part === 'continue' ? joinFragment(STAND_IN, text) : text;
      const parsed = parseCardsLenient(answer);
      const read = parsed.drafts.length > 0 && parsed.problems.length === 0;
      return part === 'continue' ? read && continues(STAND_IN, answer) : read;
    },
  };
}

/** The three targets over the reader's current prompts, which the lab does not vary. */
// RF-1406
export function cardSurfaceTargets(current: ReaderPrompts): LabTarget[] {
  return [
    targetOf('cards/continue', 'continue', current),
    targetOf('cards/flows', 'flows', current),
    targetOf('cards/screens', 'screens', current),
  ];
}
