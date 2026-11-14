import { z } from 'zod';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import {
  asksSuggestedAnswers,
  readerPlaceholders,
  readerPromptsFor,
  readerSystemPrompt,
  readerTaskMessage,
  type ReaderPrompts,
} from '../../agent/reader-prompts.js';
import { readerToolDefinitions } from '../../agent/tool-definitions.js';
import type { OutputProblem } from '../../cards/output-problem.js';
import { parseCardsLenient } from '../../cards/parse-cards.js';
import { renderRepairRequest } from '../../cards/repair-request.js';
import type { LlmMessage } from '../../ports/llm-provider.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';
import { areaBlock, readerCaseSchema, replayOfReads } from './reader-case.js';
import { mergedRepairOutcome } from './cards-repair-merge.js';
import { cardsOutcome } from './reader-targets.js';
import { askOnce, problemsOf } from './single-call.js';

// RF-1406, RF-202, RF-208, ADR-029: the lab target of the reader's repair request (`cards/repair`).
// A case is a card-format case (the area and the reads replayed as a `read_file` turn) with an
// earlier answer: fixed text written for the case, never a model's. The conversation is the task
// message, the replay, that answer as the assistant's turn and the repair request the run builds
// from the problems the run's card parser finds in it (`renderRepairRequest`), the file under test
// in place of the reader's repair prompt. One call is made with the reader's tools and the answer is
// read by the card parser: `Valid`, `Partial`, `Unusable` or `ReadsMore`. A draft without its one
// placeholder is `BadPrompt` before any call. A `Valid` answer is merged into the earlier answer as
// the run merges it, `Fixed` or `Dropped` (cards-repair-merge.ts, P10-07). The second repair and the
// workbook rule hints of the run are not replayed.

const repairCaseSchema = readerCaseSchema.extend({ answer: z.string().min(1).max(20_000) });
type RepairCase = z.infer<typeof repairCaseSchema>;

/** The problems the run's card parser finds in the earlier answer, under the card format given. */
function problemsIn(answer: string, prompts: ReaderPrompts): readonly OutputProblem[] {
  const suggested = asksSuggestedAnswers(prompts.cardFormat) ? 'required' : 'optional';
  return parseCardsLenient(answer, new Map(), { suggestedAnswers: suggested }).problems;
}

function messagesOf(input: RepairCase, prompts: ReaderPrompts, env: TargetEnv): LlmMessage[] {
  const tag = (): string => env.ids.dataBlockTag();
  const task = readerTaskMessage(prompts, areaBlock(input, tag()));
  const request = renderRepairRequest(prompts.repair.text, problemsIn(input.answer, prompts));
  return [
    { role: 'user', content: task },
    ...replayOfReads(input, prompts, tag),
    { role: 'assistant', content: input.answer },
    { role: 'user', content: request.trimEnd() },
  ];
}

function preparedOf(input: RepairCase, current: ReaderPrompts): PreparedCase {
  return {
    run: async (env: TargetEnv, file: PromptFile): Promise<TargetOutcome> => {
      if (file.text.split(readerPlaceholders.repair).length !== 2) {
        return { usable: false, detail: 'BadPrompt' };
      }
      const marks = { flows: false, screens: false };
      const prompts = readerPromptsFor(
        { ...current, repair: file },
        marks,
        input.workbook ?? false,
      );
      const asked = await askOnce(env, {
        ...{ role: 'reader', task: 'reader-lab', system: readerSystemPrompt(prompts) },
        ...{ messages: messagesOf(input, prompts, env), tools: readerToolDefinitions },
      });
      if (!asked.ok) return asked.error;
      const answers = { earlier: input.answer, repair: asked.value.text };
      const suggested = asksSuggestedAnswers(prompts.cardFormat) ? 'required' : 'optional';
      const options = { suggestedAnswers: suggested } as const;
      return mergedRepairOutcome(cardsOutcome(asked.value, prompts), answers, options);
    },
  };
}

function parseCase(data: unknown, current: ReaderPrompts): Result<PreparedCase, string> {
  const parsed = repairCaseSchema.safeParse(data);
  if (!parsed.success) return err(problemsOf(parsed.error.issues));
  if ((parsed.data.reads ?? []).length === 0) return err('a card repair case needs reads');
  if (problemsIn(parsed.data.answer, current).length === 0) {
    return err('a card repair case needs an answer the card parser finds a problem in');
  }
  return ok(preparedOf(parsed.data, current));
}

/** The target of the reader's repair request, over the reader's current prompts. */
// RF-1406
export function cardsRepairTarget(current: ReaderPrompts): LabTarget {
  return {
    id: 'cards/repair',
    role: 'reader',
    parseInput: (data) => parseCase(data, current),
    readsAnswer: (text) => {
      const parsed = parseCardsLenient(text);
      return parsed.drafts.length > 0 && parsed.problems.length === 0;
    },
  };
}
