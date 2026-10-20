import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AgentRole, LlmMessage, LlmProvider, LlmResponse } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import { collectCards } from './answer-collector.js';
import {
  failedCallEnd,
  stoppedEnd,
  taskResult,
  type AgentTaskEnd,
  type AgentTaskResult,
} from './agent-task-result.js';
import type { AgentToolSet } from './agent-tool-set.js';
import { ReadGate } from './read-gate.js';
import {
  readerSystemPrompt,
  readerTaskMessage,
  readFirstMessage,
  turnsLeftMessage,
  type ReaderPrompts,
} from './reader-prompts.js';
import { ToolRunner } from './tool-runner.js';

// RF-201, RF-202, RF-145, ADR-003, architecture section 8: the reader's tool-calling loop. It
// sends the system prompt, the conversation and the tool definitions through the LlmProvider port
// (the guarded provider), runs the read-only tools the model asks for, and repeats until a final
// answer, the turn limit, the context share, a stop or a model that loops. The system prompt and
// the tools stay the same on every turn (a stable prefix for providers that cache it); repository
// content enters only as data blocks in user and tool messages.

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
  /** RF-241: the owner's answers for the area, sent as one data block after the area's. */
  readonly answers?: string;
  /** RF-209: the rejected claims a Deepen re-reads, as JSON, sent as one data block after the area's. */
  readonly rejected?: string;
  /** RF-209: the parent's cards for the area, as JSON, sent as one data block after the area's. */
  readonly parentCards?: string;
}

/** About four characters per token, the estimate the providers use too (RF-421). */
const charsPerToken = 4;

class AgentTask {
  private readonly request: AgentTaskRequest;
  private readonly system: string;
  private readonly messages: LlmMessage[] = [];
  private readonly gate: ReadGate;
  private readonly runner: ToolRunner;
  private turns = 0;
  private usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  private modelVersion: string | null = null;
  /** Tokens of the conversation at the last answer, and characters added since. */
  private reportedTokens = 0;
  private charsSince = 0;

  constructor(request: AgentTaskRequest) {
    this.request = request;
    this.system = readerSystemPrompt(request.prompts);
    this.gate = new ReadGate(request.tools.readableAreaFiles());
    this.runner = new ToolRunner(request.tools, this.gate);
    this.charsSince = this.system.length + JSON.stringify(request.tools.definitions).length;
  }

  async run(): Promise<AgentTaskResult> {
    const { prompts, tools, answers, rejected } = this.request;
    const owner = answers === undefined ? undefined : tools.renderBlock('owner_answers', answers);
    const claims = rejected === undefined ? undefined : tools.renderBlock('cards', rejected);
    const content = readerTaskMessage(prompts, tools.areaOverview(), owner, claims);
    this.add({ role: 'user', content });
    return this.result(await this.explore());
  }

  private async explore(): Promise<AgentTaskEnd> {
    const { settings, prompts } = this.request;
    for (;;) {
      const answer = await this.turn();
      if (!answer.ok) return answer.error;
      if (answer.value.toolCalls.length === 0) {
        if (this.refuseUnread(answer.value.text)) continue;
        return this.finish(answer.value.text);
      }
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
    const { signal, context } = this.request;
    this.messages.push({ role: 'assistant', content: answer.text, toolCalls: answer.toolCalls });
    for (const call of answer.toolCalls) {
      if (signal.aborted) return stoppedEnd(signal);
      const ids = { runId: context.runId, agentTaskId: context.agentTaskId, callId: call.id };
      const outcome = await this.runner.run(call, ids);
      this.add({ role: 'tool', toolCallId: call.id, content: outcome.content });
      const looping = this.runner.loopEnd();
      if (looping !== undefined) return looping;
    }
    return undefined;
  }

  /**
   * RF-206: a final answer before any file of the area was read is not accepted. The agent is told
   * which files it has not read and keeps its turns to read them.
   */
  private refuseUnread(text: string): boolean {
    const { prompts, tools, settings } = this.request;
    const turnsLeft = settings.maxTurns - this.turns;
    const files = this.gate.refuse(turnsLeft);
    if (files === undefined) return false;
    this.messages.push({ role: 'assistant', content: text });
    const block = tools.renderBlock('list_area_files', files);
    this.add({ role: 'user', content: readFirstMessage(prompts, block, turnsLeft) });
    return true;
  }

  /**
   * RF-202, RF-208: reads the final answer and asks the follow-ups it earns (two repairs, or a
   * continuation of a cut-off answer). The valid cards are kept whatever happens to the rest.
   */
  private async finish(text: string): Promise<AgentTaskEnd> {
    const { prompts } = this.request;
    const collected = await collectCards(
      text,
      (previous, message) => this.followUp(previous, message),
      prompts,
    );
    const { drafts, problems, rawOutputs, stopped } = collected;
    const left = { drafts, problems, rawOutputs: problems.length === 0 ? [] : rawOutputs };
    if (stopped !== undefined) return { ...stopped, ...left };
    if (drafts.length > 0 || problems.length === 0) return { reason: 'final-answer', ...left };
    return { reason: 'invalid-output', code: ERROR_CODES.cardOutputInvalid, ...left };
  }

  /** One more turn after the model's text: it is a turn like any other (limit, context, stop). */
  private async followUp(previous: string, content: string): Promise<Result<string, AgentTaskEnd>> {
    this.messages.push({ role: 'assistant', content: previous });
    this.add({ role: 'user', content });
    const answer = await this.turn();
    return answer.ok ? ok(answer.value.text) : err(answer.error);
  }

  private add(message: LlmMessage): void {
    this.messages.push(message);
    this.charsSince += message.content.length;
  }

  private async result(end: AgentTaskEnd): Promise<AgentTaskResult> {
    const { logger, context } = this.request;
    const result = taskResult(end, {
      turns: this.turns,
      toolErrors: this.runner.toolErrors,
      areaRead: this.gate.state(),
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
