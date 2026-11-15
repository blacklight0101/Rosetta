import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { ToolCall } from '../ports/llm-provider.js';
import type { AgentTaskEnd } from './agent-task-result.js';
import type { RepeatedCall } from './retry-note.js';
import type { AgentToolSet } from './agent-tool-set.js';
import { readMoreLines, type ReadGate } from './read-gate.js';
import { servedLines, spentMessage, withinBudget } from './read-budget.js';
import type { ToolCallIds, ToolOutcome } from './read-only-tools.js';
import { isReaderToolName, type ReaderToolName } from './tool-definitions.js';

// RF-201, RF-206: the tool calls of one task. It runs each call through the task's tools, answers a
// call made twice with the same arguments without running it again, counts the errors and the
// calls of unknown tools, tells the read gate what each call gave, and says when the model loops.
// RF-1414: after a read-more ask, `read_file` is cut to the lines the ask's budget has left.

/** A model that repeats one call this often, or names unknown tools this often, is stopped. */
const maxRepeatedCalls = 3;
const maxUnknownToolCalls = 3;

/** The key calls are compared by; wrapped in a list, so arguments that are undefined still give a string. */
function signatureOf(name: string, args: unknown): string {
  return `${name}\n${JSON.stringify([args])}`;
}

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
    const outcome = await this.outcomeOf(call, ids);
    if (outcome.error !== undefined) this.toolErrors += 1;
    if (outcome.error?.code === ERROR_CODES.toolUnknown) this.unknownCalls += 1;
    this.gate.note(outcome);
    return outcome;
  }

  /**
   * RF-1414: a repeat of a call that ran is answered without running it; any other call runs cut to
   * the lines the read-more budget has left. A read the budget refuses is not made, so it is not
   * remembered and never becomes a repeat; a cut read is remembered as the lines it served, so the
   * same call runs again after the next ask.
   */
  private async outcomeOf(call: ToolCall, ids: ToolCallIds): Promise<ToolOutcome> {
    const { name } = call;
    if (!isReaderToolName(name)) return this.tools.run(call, ids);
    if (this.isRepeat(name, call.arguments)) return this.repeatedOutcome(name);
    const within = withinBudget(call, this.gate.linesLeftToRead());
    if (within === 'spent') {
      return { content: this.tools.renderBlock('read_file', spentMessage(readMoreLines)) };
    }
    this.seen.add(signatureOf(name, within.arguments));
    const outcome = await this.tools.run(within, ids);
    if (name === 'read_file') this.gate.served(servedLines(outcome));
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

  /** A known tool called again with the arguments of a call that ran; unknown tools are counted on their own. */
  private isRepeat(name: ReaderToolName, args: unknown): boolean {
    if (!this.seen.has(signatureOf(name, args))) return false;
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
