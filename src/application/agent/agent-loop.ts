import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { LlmMessage, LlmProvider, LlmResponse } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import { collectCards } from './answer-collector.js';
import type { AnswerText } from './cut-answer.js';
import { recordNote, type AnswerNote } from './answer-note.js';
import { logTaskEnd } from './agent-task-log.js';
import { EmptyAnswerRetry } from './empty-answer-retry.js';
import { charsPerToken } from './context-room.js';
import {
  failedCallEnd,
  stoppedEnd,
  taskResult,
  type AgentTaskEnd,
  type AgentTaskResult,
} from './agent-task-result.js';
import type { AgentToolSet } from './agent-tool-set.js';
import type { AgentTaskContext, AgentTaskSettings } from './agent-task-settings.js';
import { ReadGate } from './read-gate.js';
import { retryNoteMessage, type RetryNote } from './retry-note.js';
import { withUnreadRanges, type UnreadRanges } from './unread-ranges-note.js';
import { refusalFor } from './refusal.js';
import {
  readerSystemPrompt,
  readerTaskMessage,
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
  /** RST-1303: a retry of an area that ended on a repeated call: a note added to the task message. */
  readonly retryNote?: RetryNote;
  readonly unreadRanges?: readonly UnreadRanges[];
  /** P3-105: the rendered workbook folders of the snapshot, for the rule-citation question. */
  readonly workbookFolders?: readonly string[] | undefined;
  /** Q-55: told why an answer was refused, accepted for lack of room, kept or cut (never its text). */
  readonly onNote?: (note: AnswerNote) => Promise<void>;
}

class AgentTask {
  private readonly request: AgentTaskRequest;
  private readonly system: string;
  private readonly messages: LlmMessage[] = [];
  private readonly gate: ReadGate;
  private readonly runner: ToolRunner;
  private readonly emptyRetry: EmptyAnswerRetry;
  private turns = 0;
  private usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  private modelVersion: string | null = null;
  /** Tokens of the conversation at the last answer, and characters added since. */
  private reportedTokens = 0;
  private charsSince = 0;
  /** Q-55: the latest answer that was refused, read as the final answer if the task ends first. */
  private refused: AnswerText | undefined;

  constructor(request: AgentTaskRequest) {
    this.request = request;
    this.system = readerSystemPrompt(request.prompts);
    this.gate = new ReadGate(request.tools.readableAreaEntries());
    this.runner = new ToolRunner(request.tools, this.gate);
    this.emptyRetry = new EmptyAnswerRetry(request.settings);
    this.charsSince = this.system.length + JSON.stringify(request.tools.definitions).length;
  }

  async run(): Promise<AgentTaskResult> {
    const { prompts, tools, answers, rejected, parentCards } = this.request;
    const block = (source: 'owner_answers' | 'cards', text?: string): string | undefined =>
      text === undefined ? undefined : tools.renderBlock(source, text);
    const deepen = { rejected: block('cards', rejected), parentCards: block('cards', parentCards) };
    const owner = block('owner_answers', answers);
    const content = readerTaskMessage(prompts, tools.areaOverview(), owner, deepen);
    const noted = withUnreadRanges(content, this.request);
    this.add({ role: 'user', content: await this.withRetryNote(noted) });
    return this.result(await this.explore());
  }

  private async withRetryNote(content: string): Promise<string> {
    const { retryNote, tools } = this.request;
    if (retryNote === undefined) return content;
    await this.note({ outcome: 'retried', reason: 'repeated-calls' });
    return `${content}

${retryNoteMessage(retryNote, (source, text) => tools.renderBlock(source, text))}`;
  }

  private async explore(): Promise<AgentTaskEnd> {
    const { settings, prompts } = this.request;
    for (;;) {
      const answer = await this.turn();
      if (!answer.ok) return this.afterStop(answer.error);
      if (answer.value.toolCalls.length === 0) {
        if (await this.refuseUnread(answer.value)) continue;
        return this.finish(answer.value);
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

  /** Tokens of the conversation still free below the context share (negative when over it). */
  private freeContext(): number {
    const { contextTokens, contextShare } = this.request.settings;
    const estimate = this.reportedTokens + Math.ceil(this.charsSince / charsPerToken);
    return Math.floor(contextTokens * contextShare) - estimate;
  }

  private overContextShare(): boolean {
    return this.freeContext() <= 0;
  }

  private async call(): Promise<Result<LlmResponse, AgentTaskEnd>> {
    try {
      return ok(
        await this.emptyRetry.ask(
          () => this.send(),
          (note) => this.note(note),
        ),
      );
    } catch (error) {
      return err(failedCallEnd(error, this.request.signal));
    }
  }

  private async send(): Promise<LlmResponse> {
    const { provider, settings, context, tools, signal } = this.request;
    const response = await provider.complete({
      context: { ...context, callId: this.request.nextCallId() },
      model: settings.model,
      system: this.system,
      messages: [...this.messages],
      tools: tools.definitions,
      ...this.emptyRetry.request,
      ...(settings.temperature === undefined ? {} : { temperature: settings.temperature }),
      signal,
    });
    this.count(response);
    return response;
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
   * which files it has not read and keeps its turns to read them. Q-50: so is, once, an answer
   * after less than half of the area's first-party tokens were read, with the files still unread;
   * Q-55: unless the conversation has no room for another read and answer, when it is taken as is.
   */
  private async refuseUnread(answered: AnswerText): Promise<boolean> {
    const { prompts, tools, settings } = this.request;
    const refusal = await refusalFor({
      ...{ gate: this.gate, prompts, answer: answered.text, freeContext: this.freeContext() },
      block: (files) => tools.renderBlock('list_area_files', files),
      turnsLeft: settings.maxTurns - this.turns,
      note: (note) => this.note(note),
    });
    if (refusal === undefined) return false;
    this.refused = answered;
    this.messages.push({ role: 'assistant', content: answered.text });
    this.add({ role: 'user', content: refusal.message });
    await this.note({ outcome: 'refused', reason: refusal.reason });
    return true;
  }

  /** Q-55: a task that ends after a refusal reads the refused answer as its final answer. */
  private async afterStop(end: AgentTaskEnd): Promise<AgentTaskEnd> {
    const kept = this.refused;
    if (kept === undefined) return end;
    if (end.reason !== 'context-limit' && end.reason !== 'max-turns') return end;
    await this.note({ outcome: 'kept', reason: end.reason });
    return this.finish(kept);
  }

  private note(note: AnswerNote): Promise<void> {
    const { logger, context, onNote } = this.request;
    const sink = { logger, runId: context.runId, agentTaskId: context.agentTaskId };
    return recordNote(onNote === undefined ? sink : { ...sink, onNote }, note);
  }

  /** RF-202, RF-208: reads the final answer and asks its follow-ups; valid cards are always kept. */
  private async finish(answer: AnswerText): Promise<AgentTaskEnd> {
    const { prompts } = this.request;
    const collected = await collectCards(
      answer,
      (previous, message) => this.followUp(previous, message),
      prompts,
      {
        rows: (path) => this.request.tools.rowSpans(path),
        workbookFolders: this.request.workbookFolders,
      },
    );
    const { drafts, problems, rawOutputs, stopped } = collected;
    if (collected.cutKept)
      await this.note({ outcome: 'cut', reason: stopped?.reason ?? 'unfinished' });
    const left = { drafts, problems, rawOutputs: problems.length === 0 ? [] : rawOutputs };
    if (stopped !== undefined) return { ...stopped, ...left };
    if (drafts.length > 0 || problems.length === 0) return { reason: 'final-answer', ...left };
    return { reason: 'invalid-output', code: ERROR_CODES.cardOutputInvalid, ...left };
  }

  /** One more turn after the model's text, like any other (limit, context, stop). */
  private async followUp(
    previous: string,
    content: string,
  ): Promise<Result<AnswerText, AgentTaskEnd>> {
    this.messages.push({ role: 'assistant', content: previous });
    this.add({ role: 'user', content });
    return this.turn();
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
    await logTaskEnd(logger, context, result);
    return result;
  }
}

/** Runs one agent task to its end; it never throws for a model's behaviour or a refused call. */
// RF-201
export async function runAgentTask(request: AgentTaskRequest): Promise<AgentTaskResult> {
  return new AgentTask(request).run();
}
