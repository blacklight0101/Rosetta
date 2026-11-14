import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import { readerToolDefinitions } from '../../agent/tool-definitions.js';
import {
  readerPlaceholders,
  readerPromptsFor,
  readerSystemPrompt,
  readerTaskMessage,
  readMoreMessage,
  type ReaderPrompts,
} from '../../agent/reader-prompts.js';
import { parseCardsLenient } from '../../cards/parse-cards.js';
import type { LlmMessage, LlmResponse } from '../../ports/llm-provider.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';
import { areaBlock, replayOfReads } from './reader-case.js';
import { blockOf, readerPartCaseSchema, type ReaderPartCase } from './reader-part-case.js';
import { cardsOutcome, PREMATURE_ANSWER } from './reader-targets.js';
import { askOnce, problemsOf } from './single-call.js';
import { citedPaths, earlierCalls, readerFirstTurn, type TurnScope } from './tool-turn.js';

// RF-1406, ADR-029: the lab targets of the reader's other prompt files. Like the first four, a case
// measures one turn with the run's own builders and one call with the reader's tool definitions;
// the file under test replaces its own part of the reader's prompts and the other parts are left
// out, so a result is the effect of that file alone:
//   reader/answers, reader/reread, reader/parent-cards  the part they add to the first user message
//                     (a tool turn, RF-1410: `ReadsFiles`, `ReadsWithWaste`, `NoAreaRead`,
//                     `BadToolCall`, `Answered`, `Empty`, with the counts of its calls)
//   reader/read-more  the refusal after a short read: the reads, a fixed answer, the refusal (same kinds)
//   reader/turns-left the message after the reads, with the last turn left (`Valid`, `Partial`,
//                     `NoCards`, `Unusable`, `ReadsMore`, read by the card parser; RF-1410: an
//                     empty list with no problem is a final answer a run accepts, so it is usable)
//   reader/workbook   the guidance added to the system prompt of a workbook area, after the same
//                     replay as the card format (same kinds as the turns-left message)

interface Spec {
  readonly id: string;
  /** The reader prompt the file under test replaces. */
  readonly part: 'answers' | 'reread' | 'parentCards' | 'readMore' | 'turnsLeft' | 'workbook';
  /** The placeholder the draft must hold exactly once, if it has one. */
  readonly placeholder?: string;
  /** What the case lacks for this prompt, or nothing when it holds it. */
  readonly lacks: (input: ReaderPartCase) => string | undefined;
  readonly messages: (
    input: ReaderPartCase,
    prompts: ReaderPrompts,
    env: TargetEnv,
  ) => LlmMessage[];
  /** Whether the turn is read as the final answer (cards) or as the first turn of a task. */
  readonly cards: boolean;
  /** RF-1410: the files the prompt points the reads at, when it points at some. */
  readonly aim?: (input: ReaderPartCase) => TurnScope['aim'];
}

const missing = (what: string): string => `a case for this prompt needs ${what}`;
const needsReads = (input: ReaderPartCase): string | undefined =>
  (input.reads ?? []).length === 0 ? missing('reads') : undefined;

function taskOf(input: ReaderPartCase, prompts: ReaderPrompts, env: TargetEnv): LlmMessage {
  const own = (source: 'owner_answers' | 'cards', text: string | undefined) =>
    text === undefined ? undefined : blockOf(source, text, env.ids.dataBlockTag());
  const deepen = {
    rejected: own('cards', input.rejected),
    parentCards: own('cards', input.parentCards),
  };
  const area = areaBlock(input, env.ids.dataBlockTag());
  const content = readerTaskMessage(prompts, area, own('owner_answers', input.answers), deepen);
  return { role: 'user', content };
}

function replayedTurn(input: ReaderPartCase, prompts: ReaderPrompts, env: TargetEnv): LlmMessage[] {
  const tag = (): string => env.ids.dataBlockTag();
  return [taskOf(input, prompts, env), ...replayOfReads(input, prompts, tag)];
}

function afterShortRead(
  input: ReaderPartCase,
  prompts: ReaderPrompts,
  env: TargetEnv,
): LlmMessage[] {
  const facts = input.readMore;
  if (facts === undefined) return [];
  const filesBlock = blockOf('list_area_files', facts.unread.join('\n'), env.ids.dataBlockTag());
  const turns = Math.max(1, input.turns - 1);
  const content = readMoreMessage(prompts, { ...facts, filesBlock, turns });
  return [
    ...replayedTurn(input, prompts, env),
    { role: 'assistant', content: PREMATURE_ANSWER },
    { role: 'user', content },
  ];
}

const firstMessageOnly = (
  input: ReaderPartCase,
  prompts: ReaderPrompts,
  env: TargetEnv,
): LlmMessage[] => [taskOf(input, prompts, env)];

const specs: readonly Spec[] = [
  {
    id: 'reader/answers',
    part: 'answers',
    placeholder: readerPlaceholders.answers,
    lacks: (input) => (input.answers === undefined ? missing('answers') : undefined),
    messages: firstMessageOnly,
    cards: false,
  },
  {
    id: 'reader/parent-cards',
    part: 'parentCards',
    placeholder: readerPlaceholders.parentCards,
    lacks: (input) => (input.parentCards === undefined ? missing('parentCards') : undefined),
    messages: firstMessageOnly,
    cards: false,
  },
  {
    id: 'reader/read-more',
    part: 'readMore',
    placeholder: readerPlaceholders.readMoreFiles,
    lacks: (input) => (input.readMore === undefined ? missing('readMore') : needsReads(input)),
    messages: afterShortRead,
    cards: false,
    aim: (input) => ({ kind: 'unread', paths: new Set(input.readMore?.unread ?? []) }),
  },
  {
    id: 'reader/reread',
    part: 'reread',
    placeholder: readerPlaceholders.reread,
    lacks: (input) => (input.rejected === undefined ? missing('rejected') : undefined),
    messages: firstMessageOnly,
    cards: false,
    aim: (input) => ({ kind: 'cited', paths: citedPaths(input.rejected ?? '') }),
  },
  {
    id: 'reader/turns-left',
    part: 'turnsLeft',
    placeholder: readerPlaceholders.turnsLeft,
    lacks: needsReads,
    messages: replayedTurn,
    cards: true,
  },
  {
    id: 'reader/workbook',
    part: 'workbook',
    lacks: (input) => (input.workbook === true ? needsReads(input) : missing('workbook: true')),
    messages: replayedTurn,
    cards: true,
  },
];

/**
 * RF-1410: the last turn read as a run reads it. An empty cards list with no problem ends a run's
 * task `final-answer` with no card (agent-loop.ts `finish`); it is `NoCards`, usable only where the
 * case expects it, as a model that gives up on an area with code answers the same.
 */
function lastTurnOutcome(response: LlmResponse, prompts: ReaderPrompts): TargetOutcome {
  const outcome = cardsOutcome(response, prompts);
  if (outcome.detail !== 'Unusable') return outcome;
  const parsed = parseCardsLenient(response.text, new Map());
  const noCards = { usable: false, detail: 'NoCards', usableWhenExpected: true };
  return parsed.problems.length === 0 ? noCards : outcome;
}

function preparedOf(spec: Spec, input: ReaderPartCase, current: ReaderPrompts): PreparedCase {
  return {
    run: async (env: TargetEnv, file: PromptFile): Promise<TargetOutcome> => {
      const { placeholder } = spec;
      if (placeholder !== undefined && file.text.split(placeholder).length !== 2) {
        return { usable: false, detail: 'BadPrompt' };
      }
      const tested = { ...current, [spec.part]: file };
      const marks = { flows: false, screens: false };
      const prompts = readerPromptsFor(tested, marks, input.workbook ?? false);
      const messages = spec.messages(input, prompts, env);
      const asked = await askOnce(env, {
        ...{ role: 'reader', task: 'reader-lab', system: readerSystemPrompt(prompts) },
        ...{ messages, tools: readerToolDefinitions },
      });
      if (!asked.ok) return asked.error;
      if (spec.cards) return lastTurnOutcome(asked.value, prompts);
      const aim = spec.aim?.(input) ?? null;
      const shareBefore = input.readMore === undefined ? null : input.readMore.percent / 100;
      return readerFirstTurn(asked.value, {
        ...{ files: input.files, earlier: earlierCalls(messages) },
        ...{ aim, shareBefore },
      });
    },
  };
}

function targetOf(spec: Spec, current: ReaderPrompts): LabTarget {
  return {
    id: spec.id,
    role: 'reader',
    parseInput: (data): Result<PreparedCase, string> => {
      const parsed = readerPartCaseSchema.safeParse(data);
      if (!parsed.success) return err(problemsOf(parsed.error.issues));
      const lacks = spec.lacks(parsed.data);
      return lacks === undefined ? ok(preparedOf(spec, parsed.data, current)) : err(lacks);
    },
    readsAnswer: (text) => {
      // RF-1403: a first turn has no answer parser and may answer with tool calls: not applicable.
      if (!spec.cards) return null;
      const parsed = parseCardsLenient(text);
      return parsed.drafts.length > 0 && parsed.problems.length === 0;
    },
  };
}

/** The six targets of the reader's other prompts over its current prompts, which the lab does not vary. */
// RF-1406
export function readerPartTargets(current: ReaderPrompts): LabTarget[] {
  return specs.map((spec) => targetOf(spec, current));
}
