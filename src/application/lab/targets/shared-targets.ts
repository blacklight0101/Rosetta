import { z } from 'zod';
import { err, ok, type Result } from '../../../domain/errors/result.js';
import type { PromptFile } from '../../agent/prompt-file.js';
import {
  readerPromptsFor,
  readerSystemPrompt,
  readerTaskMessage,
  type ReaderPrompts,
} from '../../agent/reader-prompts.js';
import { readerToolDefinitions } from '../../agent/tool-definitions.js';
import type {
  LlmMessage,
  LlmResponse,
  ToolCall,
  ToolDefinition,
} from '../../ports/llm-provider.js';
import type { LabTarget, PreparedCase, TargetEnv, TargetOutcome } from '../lab-target.js';
import { areaBlock, readerCaseSchema, replayOfReads, type ReaderCase } from './reader-case.js';
import { cardsOutcome, firstTurn } from './reader-targets.js';
import { askOnce, problemsOf } from './single-call.js';

// RF-1406, ADR-029, P10-10: the lab targets of the shared prompts a model reads. Both are
// fragments of a reader turn, so a case is a reader case and the turn is built with the run's own
// builders:
//   shared/masked-value        the note a masked value is replaced with. The case holds reads whose
//                              lines carry the token `{secret}` and the invented value in `secret`;
//                              the lab puts the value in, masks the reads with the masker of the run
//                              using the file under test, and sends the replay. `Leaked` is a value
//                              that is still in the text sent or is repeated in the answer; else the
//                              answer is read by the card parser (`Valid`, `Partial`, `Unusable`,
//                              `ReadsMore`)
//   shared/text-tool-protocol  the protocol of a model without native tool calling, appended to the
//                              system prompt with the tools as the Ollama adapter appends it; the
//                              request carries no native tools, the replay of the reads travels as
//                              text blocks, and the answer is read by the run's text parser, then as
//                              a first turn (`ReadsFiles`, `BadToolCall`, `Answered`, `Empty`) or,
//                              after reads, as cards
// `shared/secret-risk` has no target: the domain fills its text and no model is asked (RF-1406).

/** What the lab takes from the infrastructure: the run's masker and its text protocol. */
export interface SharedKit {
  /** The masker of the run using the file for its replacement; undefined when the file is no template. */
  readonly maskerOf: (
    file: PromptFile,
  ) => { mask(text: string): { readonly text: string } } | undefined;
  readonly protocol: {
    /** The run's placeholder for the tools in the protocol file (one or more are accepted). */
    readonly toolsPlaceholder: string;
    readonly systemOf: (
      system: string,
      template: string,
      tools: readonly ToolDefinition[],
    ) => string;
    readonly parse: (content: string) => {
      readonly text: string;
      readonly calls: readonly {
        readonly name: string;
        readonly arguments: Readonly<Record<string, unknown>>;
      }[];
    };
    readonly toolCallBlock: (call: ToolCall) => string;
    readonly toolResultBlock: (toolCallId: string, content: string) => string;
  };
}

/** Where a case's lines name the secret. */
const SECRET_TOKEN = '{secret}';
/** The note starts with the marker, as the `ReplacementOf` contract of the masker requires. */
const MARKER = '[MASKED:';

const maskedCaseSchema = readerCaseSchema.extend({
  secret: z.string().regex(/^[A-Za-z0-9]{6,60}$/u),
});
type MaskedCase = z.infer<typeof maskedCaseSchema>;

const needsReads = 'a case for this prompt needs reads';
const noToken = `a case for this prompt needs a line with ${SECRET_TOKEN}`;

const noMarks = { flows: false, screens: false };

function system(current: ReaderPrompts, input: ReaderCase): string {
  return readerSystemPrompt(readerPromptsFor(current, noMarks, input.workbook ?? false));
}

/** The reads with the value put in and masked by the masker; line numbers stay where they were. */
function maskedReads(input: MaskedCase, masker: { mask(text: string): { text: string } }) {
  return (input.reads ?? []).map((read) => {
    const text = read.lines.join('\n').replaceAll(SECRET_TOKEN, input.secret);
    return { ...read, lines: masker.mask(text).text.split('\n') };
  });
}

function maskedPrepared(input: MaskedCase, current: ReaderPrompts, kit: SharedKit): PreparedCase {
  return {
    run: async (env: TargetEnv, file: PromptFile): Promise<TargetOutcome> => {
      const masker = file.text.trimStart().startsWith(MARKER) ? kit.maskerOf(file) : undefined;
      if (masker === undefined) return { usable: false, detail: 'BadPrompt' };
      const reads = maskedReads(input, masker);
      if (reads.some((read) => read.lines.some((line) => line.includes(input.secret)))) {
        return { usable: false, detail: 'Leaked' };
      }
      const prompts = readerPromptsFor(current, noMarks, input.workbook ?? false);
      const tag = (): string => env.ids.dataBlockTag();
      const task: LlmMessage = {
        role: 'user',
        content: readerTaskMessage(prompts, areaBlock(input, tag())),
      };
      const messages = [task, ...replayOfReads({ ...input, reads }, prompts, tag)];
      const asked = await askOnce(env, {
        ...{ role: 'reader', task: 'reader-lab', system: readerSystemPrompt(prompts) },
        ...{ messages, tools: readerToolDefinitions },
      });
      if (!asked.ok) return asked.error;
      const calls = JSON.stringify(asked.value.toolCalls);
      if ([asked.value.text, calls].some((part) => part.includes(input.secret))) {
        return { usable: false, detail: 'Leaked' };
      }
      return cardsOutcome(asked.value, prompts);
    },
  };
}

function maskedTarget(current: ReaderPrompts, kit: SharedKit): LabTarget {
  return {
    id: 'shared/masked-value',
    role: 'reader',
    parseInput: (data): Result<PreparedCase, string> => {
      const parsed = maskedCaseSchema.safeParse(data);
      if (!parsed.success) return err(problemsOf(parsed.error.issues));
      const reads = parsed.data.reads ?? [];
      if (reads.length === 0) return err(needsReads);
      const marked = reads.some((read) => read.lines.some((line) => line.includes(SECRET_TOKEN)));
      return marked ? ok(maskedPrepared(parsed.data, current, kit)) : err(noToken);
    },
    readsAnswer: () => null,
  };
}

/** A replay of the reads as text: no tool role, the calls and results as the protocol's blocks. */
function textReplay(messages: readonly LlmMessage[], kit: SharedKit): LlmMessage[] {
  return messages.map((message): LlmMessage => {
    if (message.role === 'tool') {
      return {
        role: 'user',
        content: kit.protocol.toolResultBlock(message.toolCallId, message.content),
      };
    }
    if (message.role !== 'assistant') return message;
    const blocks = (message.toolCalls ?? []).map(kit.protocol.toolCallBlock);
    const content = [message.content, ...blocks].filter((part) => part !== '').join('\n\n');
    return { role: 'assistant', content };
  });
}

/** The answer as the run's text parser reads it: the prose and the calls of its blocks. */
function parsedAnswer(response: LlmResponse, kit: SharedKit): LlmResponse {
  const parsed = kit.protocol.parse(response.text);
  const toolCalls = parsed.calls.map((call, index) => ({
    id: `lab-call-${String(index + 1)}`,
    name: call.name,
    arguments: call.arguments,
  }));
  return { ...response, text: parsed.text, toolCalls };
}

function protocolPrepared(input: ReaderCase, current: ReaderPrompts, kit: SharedKit): PreparedCase {
  return {
    run: async (env: TargetEnv, file: PromptFile): Promise<TargetOutcome> => {
      if (!file.text.includes(kit.protocol.toolsPlaceholder))
        return { usable: false, detail: 'BadPrompt' };
      const prompts = readerPromptsFor(current, noMarks, input.workbook ?? false);
      const tag = (): string => env.ids.dataBlockTag();
      const task: LlmMessage = {
        role: 'user',
        content: readerTaskMessage(prompts, areaBlock(input, tag())),
      };
      const messages = textReplay([task, ...replayOfReads(input, prompts, tag)], kit);
      const text = kit.protocol.systemOf(system(current, input), file.text, readerToolDefinitions);
      const asked = await askOnce(env, {
        ...{ role: 'reader', task: 'reader-lab', system: text },
        ...{ messages, tools: [] },
      });
      if (!asked.ok) return asked.error;
      const answer = parsedAnswer(asked.value, kit);
      return (input.reads ?? []).length > 0 ? cardsOutcome(answer, prompts) : firstTurn(answer);
    },
  };
}

function protocolTarget(current: ReaderPrompts, kit: SharedKit): LabTarget {
  return {
    id: 'shared/text-tool-protocol',
    role: 'reader',
    parseInput: (data): Result<PreparedCase, string> => {
      const parsed = readerCaseSchema.safeParse(data);
      if (!parsed.success) return err(problemsOf(parsed.error.issues));
      return ok(protocolPrepared(parsed.data, current, kit));
    },
    readsAnswer: () => null,
  };
}

/** The two shared targets over the reader's current prompts, which the lab does not vary. */
// RF-1406
export function sharedTargets(current: ReaderPrompts, kit: SharedKit): LabTarget[] {
  return [maskedTarget(current, kit), protocolTarget(current, kit)];
}
