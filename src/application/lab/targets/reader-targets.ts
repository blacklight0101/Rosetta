import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import { parseToolArguments } from '../../agent/tool-arguments.js';
import { isReaderToolName, readerToolDefinitions } from '../../agent/tool-definitions.js';
import {
  asksSuggestedAnswers,
  readerPlaceholders,
  readerPromptsFor,
  readerSystemPrompt,
  readerTaskMessage,
  readFirstMessage,
  type ReaderPrompts,
} from '../../agent/reader-prompts.js';
import { parseCardsLenient } from '../../cards/parse-cards.js';
import type { LlmMessage, LlmResponse } from '../../ports/llm-provider.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';
import {
  areaBlock,
  readerCaseSchema,
  onLastTurn,
  replayOfReads,
  unreadBlock,
  type ReaderCase,
} from './reader-case.js';
import { askOnce, problemsOf } from './single-call.js';

// RF-1406, ADR-029: the lab targets of the reader's prompts. The reader is a tool loop; a case
// measures one turn of it with the run's own prompt builders and one call, with the reader's tool
// definitions. The file under test replaces its own part of the reader's current prompts:
//   reader/task       the first user message (`reader/task.vN.md`), first turn
//   reader/area       the system prompt (`reader/area.vN.md`), first turn
//   reader/read-first the refusal of an answer before any read, the turn after a fixed premature answer
//   cards/card-format the shape of the final answer, the turn after a replay of the reads of the case
// `detail` of a first turn is `ReadsFiles`, `BadToolCall`, `Answered` or `Empty`; of the card format
// `Valid`, `Partial`, `Unusable` or `ReadsMore`. A first turn has no answer parser of its own and its
// answer may be tool calls, which the text of the answer does not show, so its first-try validity is
// not applicable (null, RF-1403); `detail` and `usable` are the measure.

type Part = 'system' | 'task' | 'readFirst' | 'cardFormat';

/** The answer given before any read in the read-first case: fixed text, not a model's. */
export const PREMATURE_ANSWER = '{"cards": []}';

export function firstTurn(response: LlmResponse): TargetOutcome {
  const { toolCalls } = response;
  if (toolCalls.length === 0) {
    return { usable: false, detail: response.text.trim() === '' ? 'Empty' : 'Answered' };
  }
  const valid = toolCalls.every(
    (call) => isReaderToolName(call.name) && parseToolArguments(call.name, call.arguments).ok,
  );
  return { usable: valid, detail: valid ? 'ReadsFiles' : 'BadToolCall' };
}

export function cardsOutcome(response: LlmResponse, prompts: ReaderPrompts): TargetOutcome {
  if (response.toolCalls.length > 0) return { usable: false, detail: 'ReadsMore' };
  const suggested = asksSuggestedAnswers(prompts.cardFormat) ? 'required' : 'optional';
  const parsed = parseCardsLenient(response.text, new Map(), { suggestedAnswers: suggested });
  if (parsed.drafts.length === 0) return { usable: false, detail: 'Unusable' };
  return { usable: true, detail: parsed.problems.length === 0 ? 'Valid' : 'Partial' };
}

function messagesOf(
  part: Part,
  input: ReaderCase,
  prompts: ReaderPrompts,
  env: TargetEnv,
): LlmMessage[] {
  const tag = (): string => env.ids.dataBlockTag();
  const task: LlmMessage = {
    role: 'user',
    content: readerTaskMessage(prompts, areaBlock(input, tag())),
  };
  if (part === 'readFirst') {
    const refusal = readFirstMessage(
      prompts,
      unreadBlock(input, tag()),
      Math.max(1, input.turns - 1),
    );
    return [
      task,
      { role: 'assistant', content: PREMATURE_ANSWER },
      { role: 'user', content: refusal },
    ];
  }
  return part === 'cardFormat' ? [task, ...replayOfReads(onLastTurn(input), prompts, tag)] : [task];
}

const placeholderOf: Partial<Record<Part, string>> = {
  task: readerPlaceholders.task,
  readFirst: readerPlaceholders.readFirstFiles,
};

function preparedOf(part: Part, input: ReaderCase, current: ReaderPrompts): PreparedCase {
  return {
    run: async (env: TargetEnv, file: PromptFile): Promise<TargetOutcome> => {
      const placeholder = placeholderOf[part];
      if (placeholder !== undefined && file.text.split(placeholder).length !== 2) {
        return { usable: false, detail: 'BadPrompt' };
      }
      const tested = { ...current, [part]: file };
      const prompts = readerPromptsFor(
        tested,
        { flows: false, screens: false },
        input.workbook ?? false,
      );
      const asked = await askOnce(env, {
        ...{ role: 'reader', task: 'reader-lab', system: readerSystemPrompt(prompts) },
        ...{ messages: messagesOf(part, input, prompts, env) },
        // The card format is the answer of the last turn, so it carries no tools (P10-09).
        tools: part === 'cardFormat' ? [] : readerToolDefinitions,
      });
      if (!asked.ok) return asked.error;
      return part === 'cardFormat' ? cardsOutcome(asked.value, prompts) : firstTurn(asked.value);
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
      if (part === 'cardFormat' && (parsed.data.reads ?? []).length === 0) {
        return err('a card-format case needs reads');
      }
      return ok(preparedOf(part, parsed.data, current));
    },
    readsAnswer: (text) => {
      if (part !== 'cardFormat') return null;
      const parsed = parseCardsLenient(text);
      return parsed.drafts.length > 0 && parsed.problems.length === 0;
    },
  };
}

/** The four reader targets over the reader's current prompts, which the lab does not vary. */
// RF-1406
export function readerTargets(current: ReaderPrompts): LabTarget[] {
  return [
    targetOf('reader/task', 'task', current),
    targetOf('reader/area', 'system', current),
    targetOf('reader/read-first', 'readFirst', current),
    targetOf('cards/card-format', 'cardFormat', current),
  ];
}
