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
//   cards/continue              the turn after a fixed cut answer and the continue file under test; the
//                               fragment the model sends is joined to the cut answer as the run joins it

/** The answer cut off in the continue case: fixed text, never a model's. */
const CUT_ANSWER =
  '{"cards": [{"type": "BR", "title": "Late fee after 30 days", "area": "billing", "summary": "An invoice unpaid after 30 days gets a late fee.", "confidence": "High", "claims": [{"text": "The late fee is added when the invoice is more than 30 days old.", "citations": ["src/Billing/Invoices.cs:40-52"]}, {"text": "The fee is a flat 5 percent of the open amount and is';

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
  const replay = replayOfReads(onLastTurn(input), prompts, tag);
  if (part !== 'continue') return [task, ...replay];
  const more: LlmMessage = { role: 'user', content: prompts.continue.text.trimEnd() };
  return [task, ...replay, { role: 'assistant' as const, content: CUT_ANSWER }, more];
}

/** The fragment of a continuation, joined to the cut answer as the run joins it, read as an answer. */
function joined(response: LlmResponse): LlmResponse {
  return { ...response, text: joinFragment(CUT_ANSWER, response.text) };
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
      return cardsOutcome(part === 'continue' ? joined(asked.value) : asked.value, prompts);
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
      const answer = part === 'continue' ? joinFragment(CUT_ANSWER, text) : text;
      const parsed = parseCardsLenient(answer);
      return parsed.drafts.length > 0 && parsed.problems.length === 0;
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
