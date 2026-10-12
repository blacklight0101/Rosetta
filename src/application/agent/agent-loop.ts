import type { DataBlockSource } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { parseCardsWithRepair, type OutputProblem } from '../cards/parse-cards.js';
import { renderRepairRequest } from '../cards/repair-request.js';
import type {
  AgentRole,
  LlmMessage,
  LlmProvider,
  LlmResponse,
  ToolCall,
  ToolDefinition,
} from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import {
  failedCallEnd,
  stoppedEnd,
  taskResult,
  type AgentTaskEnd,
  type AgentTaskResult,
} from './agent-task-result.js';
import type { ToolCallIds, ToolOutcome } from './read-only-tools.js';
import {
  readerSystemPrompt,
  readerTaskMessage,
  turnsLeftMessage,
  type ReaderPrompts,
} from './reader-prompts.js';
import { isReaderToolName, type ReaderToolName } from './tool-definitions.js';

// RF-201, RF-202, RF-145, ADR-003, architecture section 8: the reader's tool-calling loop. It
// sends the system prompt, the conversation and the tool definitions through the LlmProvider port
// (the guarded provider), runs the read-only tools the model asks for, and repeats until a final
// answer, the turn limit, the context share, a stop or a model that loops. The system prompt and
// the tools stay the same on every turn (a stable prefix for providers that cache it); repository
// content enters only as data blocks in user and tool messages.

/** The tools of one task: the read-only tool set of its area (ReadOnlyTools). */
interface AgentToolSet {
  readonly definitions: readonly ToolDefinition[];
  areaOverview(): string;
  /** RF-145: text as one data block with a fresh tag of its own. */
  renderBlock(source: DataBlockSource, text: string): string;
  run(call: ToolCall, ids: ToolCallIds): Promise<ToolOutcome>;
}

interface AgentTaskSettings {
  readonly model: string;
  /** Model calls before the task ends as `TurnLimitReached` (RF-201). */
  readonly maxTurns: number;
  /** The model's context in tokens. */
  readonly contextTokens: number;
  /** The share of the context the conversation may reach, for example 0.8. */
  readonly contextShare: number;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

interface AgentTaskContext {
  readonly runId: string;
  readonly agentTaskId: string;
  readonly role: AgentRole;
  readonly traceId: string;
  readonly parentSpanId: string;
}

export interface AgentTaskRequest {
  readonly provider: LlmProvider;
  readonly tools: AgentToolSet;
  readonly prompts: ReaderPrompts;
  readonly logger: Logger;
  readonly settings: AgentTaskSettings;
  readonly context: AgentTaskContext;
  /** `<runId>#<n>`, unique in the run, so parallel tasks share one numbering. */
  readonly nextCallId: () => string;
  /** Shared by every task of the run: Stop, shutdown and caps (architecture section 8). */
  readonly signal: AbortSignal;
}

/** A model that repeats one call this often, or names unknown tools this often, is stopped. */
const maxRepeatedCalls = 3;
const maxUnknownToolCalls = 3;
/** About four characters per token, the estimate the providers use too (RF-421). */
const charsPerToken = 4;

const repeatedMessage =
  'You already made this exact call; its result is above. Use it, or make a different call.';

class AgentTask {
  private readonly request: AgentTaskRequest;
  private readonly system: string;
  private readonly messages: LlmMessage[] = [];
  private readonly seen = new Set<string>();
  private turns = 0;
  private toolErrors = 0;
  private repeated = 0;
  private unknownCalls = 0;
  private usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  private modelVersion: string | null = null;
  /** Tokens of the conversation at the last answer, and characters added since. */
  private reportedTokens = 0;
  private charsSince = 0;
  private repairFailure: AgentTaskEnd | undefined;

  constructor(request: AgentTaskRequest) {
    this.request = request;
    this.system = readerSystemPrompt(request.prompts);
    this.charsSince = this.system.length + JSON.stringify(request.tools.definitions).length;
  }

  async run(): Promise<AgentTaskResult> {
    const { prompts, tools } = this.request;
    this.add({ role: 'user', content: readerTaskMessage(prompts, tools.areaOverview()) });
    return this.result(await this.explore());
  }

  private async explore(): Promise<AgentTaskEnd> {
    const { settings, prompts } = this.request;
    for (;;) {
      const answer = await this.turn();
      if (!answer.ok) return answer.error;
      if (answer.value.toolCalls.length === 0) return this.finish(answer.value.text);
      const stopped = await this.runTools(answer.value);
      if (stopped !== undefined) return stopped;
      const left = settings.maxTurns - this.turns;
      if (left > 0) this.add({ role: 'user', content: turnsLeftMessage(prompts, left) });
    }
  }

  /** One model call, unless a stop, the turn limit or the context share ends the task first. */
  private async turn(): Promise<Result<LlmResponse, AgentTaskEnd>> {
    const { signal, settings } = this.request;
    if (signal.aborted) return err(stoppedEnd(signal));
    if (this.turns >= settings.maxTurns) {
      return err({ reason: 'max-turns', code: ERROR_CODES.agentTurnLimitReached });
    }
    if (this.overContextShare()) {
      return err({ reason: 'context-limit', code: ERROR_CODES.agentContextLimitReached });
    }
    return this.call();
  }

  private overContextShare(): boolean {
    const { contextTokens, contextShare } = this.request.settings;
    const estimate = this.reportedTokens + Math.ceil(this.charsSince / charsPerToken);
    return estimate >= Math.floor(contextTokens * contextShare);
  }

  private async call(): Promise<Result<LlmResponse, AgentTaskEnd>> {
    const { provider, settings, context, tools, signal } = this.request;
    const callId = this.request.nextCallId();
    try {
      const response = await provider.complete({
        context: { ...context, callId },
        model: settings.model,
        system: this.system,
        messages: [...this.messages],
        tools: tools.definitions,
        ...(settings.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: settings.maxOutputTokens }),
        ...(settings.temperature === undefined ? {} : { temperature: settings.temperature }),
        signal,
      });
      this.count(response);
      return ok(response);
    } catch (error) {
      return err(failedCallEnd(error, signal));
    }
  }

  private count(response: LlmResponse): void {
    const { inputTokens, outputTokens, cachedInputTokens } = response.usage;
    this.turns += 1;
    this.usage = {
      inputTokens: this.usage.inputTokens + inputTokens,
      outputTokens: this.usage.outputTokens + outputTokens,
      cachedInputTokens: this.usage.cachedInputTokens + cachedInputTokens,
    };
    this.modelVersion = response.modelVersion;
    this.reportedTokens = inputTokens + outputTokens;
    this.charsSince = 0;
  }

  /** Runs the calls of one answer in order; the end of the task when the model loops. */
  private async runTools(answer: LlmResponse): Promise<AgentTaskEnd | undefined> {
    const { signal, tools, context } = this.request;
    this.messages.push({ role: 'assistant', content: answer.text, toolCalls: answer.toolCalls });
    for (const call of answer.toolCalls) {
      if (signal.aborted) return stoppedEnd(signal);
      const ids = { runId: context.runId, agentTaskId: context.agentTaskId, callId: call.id };
      const { name } = call;
      const outcome =
        isReaderToolName(name) && this.isRepeat(name, call.arguments)
          ? this.repeatedOutcome(name)
          : await tools.run(call, ids);
      if (outcome.error !== undefined) this.toolErrors += 1;
      if (outcome.error?.code === ERROR_CODES.toolUnknown) this.unknownCalls += 1;
      this.add({ role: 'tool', toolCallId: call.id, content: outcome.content });
      if (this.repeated >= maxRepeatedCalls) {
        return { reason: 'repeated-calls', code: ERROR_CODES.agentRepeatedCalls };
      }
      if (this.unknownCalls >= maxUnknownToolCalls) {
        return { reason: 'unknown-tools', code: ERROR_CODES.toolUnknown };
      }
    }
    return undefined;
  }

  /** A known tool called again with the same arguments; unknown tools are counted on their own. */
  private isRepeat(name: ReaderToolName, args: unknown): boolean {
    // Wrapped in a list, so arguments that are undefined still give a string.
    const signature = `${name}\n${JSON.stringify([args])}`;
    if (!this.seen.has(signature)) {
      this.seen.add(signature);
      return false;
    }
    this.repeated += 1;
    return true;
  }

  private repeatedOutcome(source: ReaderToolName): ToolOutcome {
    const code = ERROR_CODES.agentRepeatedCalls;
    const text = `error ${code}: ${repeatedMessage}`;
    return {
      content: this.request.tools.renderBlock(source, text),
      error: { code, message: repeatedMessage },
    };
  }

  /** RF-202: parses the final answer, with one repair turn when it is not valid cards. */
  private async finish(text: string): Promise<AgentTaskEnd> {
    const parsed = await parseCardsWithRepair(text, (problems) => this.repair(text, problems));
    if (this.repairFailure !== undefined) return this.repairFailure;
    if (parsed.ok) return { reason: 'final-answer', drafts: parsed.value.drafts };
    const { code, problems, rawOutputs } = parsed.error;
    return { reason: 'invalid-output', code, problems, rawOutputs };
  }

  private async repair(
    text: string,
    problems: readonly OutputProblem[],
  ): Promise<string | undefined> {
    this.messages.push({ role: 'assistant', content: text });
    const content = renderRepairRequest(this.request.prompts.repair.text, problems).trimEnd();
    this.add({ role: 'user', content });
    const answer = await this.turn();
    if (answer.ok) return answer.value.text;
    this.repairFailure = answer.error;
    return undefined;
  }

  private add(message: LlmMessage): void {
    this.messages.push(message);
    this.charsSince += message.content.length;
  }

  private async result(end: AgentTaskEnd): Promise<AgentTaskResult> {
    const { logger, context } = this.request;
    const result = taskResult(end, {
      turns: this.turns,
      toolErrors: this.toolErrors,
      usage: this.usage,
      modelVersion: this.modelVersion,
      messages: [...this.messages],
    });
    await logger.log({
      level: result.state === 'Done' ? 'info' : 'warn',
      logger: 'agent',
      ...(result.code === undefined ? {} : { code: result.code }),
      message: 'An agent task ended.',
      runId: context.runId,
      agentTaskId: context.agentTaskId,
      data: { state: result.state, reason: result.reason, turns: result.turns },
    });
    return result;
  }
}

/** Runs one agent task to its end; it never throws for a model's behaviour or a refused call. */
// RF-201
export async function runAgentTask(request: AgentTaskRequest): Promise<AgentTaskResult> {
  return new AgentTask(request).run();
}
