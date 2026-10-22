import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { ToolCall } from '../ports/llm-provider.js';
import type { AgentTaskEnd } from './agent-task-result.js';
import type { RepeatedCall } from './retry-note.js';
import type { AgentToolSet } from './agent-tool-set.js';
import type { ReadGate } from './read-gate.js';
import type { ToolCallIds, ToolOutcome } from './read-only-tools.js';
import { isReaderToolName, type ReaderToolName } from './tool-definitions.js';

// RF-201, RF-206: the tool calls of one task. It runs each call through the task's tools, answers a
// call made twice with the same arguments without running it again, counts the errors and the
// calls of unknown tools, tells the read gate what each call gave, and says when the model loops.

/** A model that repeats one call this often, or names unknown tools this often, is stopped. */
const maxRepeatedCalls = 3;
const maxUnknownToolCalls = 3;

const repeatedMessage =
  'You already made this exact call; its result is above. Use it, or make a different call.';

export class ToolRunner {
  /** Tool calls that got an error result. */
  toolErrors = 0;
  private readonly tools: AgentToolSet;
  private readonly gate: ReadGate;
  private readonly seen = new Set<string>();
  private repeated = 0;
  /** The call the model made again the last time it did. */
  private lastRepeat: RepeatedCall | undefined;
  private unknownCalls = 0;

  constructor(tools: AgentToolSet, gate: ReadGate) {
    this.tools = tools;
    this.gate = gate;
  }

  async run(call: ToolCall, ids: ToolCallIds): Promise<ToolOutcome> {
    const { name } = call;
    const outcome =
      isReaderToolName(name) && this.isRepeat(name, call.arguments)
        ? this.repeatedOutcome(name)
        : await this.tools.run(call, ids);
    if (outcome.error !== undefined) this.toolErrors += 1;
    if (outcome.error?.code === ERROR_CODES.toolUnknown) this.unknownCalls += 1;
    this.gate.note(outcome);
    return outcome;
  }

  /** The end of the task when the model loops, else undefined. */
  loopEnd(): AgentTaskEnd | undefined {
    if (this.repeated >= maxRepeatedCalls) {
      return {
        reason: 'repeated-calls',
        code: ERROR_CODES.agentRepeatedCalls,
        ...(this.lastRepeat === undefined ? {} : { repeatedCall: this.lastRepeat }),
      };
    }
    if (this.unknownCalls >= maxUnknownToolCalls) {
      return { reason: 'unknown-tools', code: ERROR_CODES.toolUnknown };
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
    this.lastRepeat = { tool: name, arguments: JSON.stringify(args ?? null) };
    return true;
  }

  private repeatedOutcome(source: ReaderToolName): ToolOutcome {
    const code = ERROR_CODES.agentRepeatedCalls;
    const text = `error ${code}: ${repeatedMessage}`;
    return {
      content: this.tools.renderBlock(source, text),
      error: { code, message: repeatedMessage },
    };
  }
}
