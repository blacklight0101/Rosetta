import type { AgentTaskRequest } from '../agent/agent-loop.js';
import type { LlmProvider, LlmResponse } from '../ports/llm-provider.js';
import type { RunEventPublisher } from '../runs/run-event-publisher.js';

// RF-1002, data-model.md section 3.9: the steps of one reader task as run events. The guarded
// provider and the read-only tools of the task are wrapped, so every answer publishes
// `agent.turn` and every tool call `agent.tool.called` and `agent.tool.result`, without the agent
// loop knowing about events. The wrapped provider is still the guarded one: every call passes the
// budget and egress guards first (ADR-006, ADR-007). Arguments are reduced to paths, line ranges
// and patterns, never file content.

type AgentTools = AgentTaskRequest['tools'];

export interface TaskEvents {
  readonly events: RunEventPublisher;
  readonly agentTaskId: string;
  /** Called with each answer: its model version (RNF-004) and the Ollama context it was sent with. */
  readonly onAnswer: (response: LlmResponse) => Promise<void>;
}

/** The model calls the task has made so far; a tool call belongs to the latest one. */
export class TurnCounter {
  value = 0;
}

const ARGUMENT_KEYS = ['path', 'startLine', 'endLine', 'pattern', 'pathGlob', 'symbol'] as const;
const MAX_TEXT = 200;
const MAX_TOOL_NAME = 64;

/** The arguments the event may show: the known keys, text cut to 200 characters. */
function shownArguments(value: unknown): Record<string, string | number> {
  if (typeof value !== 'object' || value === null) return {};
  const shown: Record<string, string | number> = {};
  for (const key of ARGUMENT_KEYS) {
    const item: unknown = Reflect.get(value, key);
    if (typeof item === 'string') shown[key] = item.slice(0, MAX_TEXT);
    else if (typeof item === 'number' && Number.isFinite(item)) shown[key] = item;
  }
  return shown;
}

// RF-1002
export function providerWithEvents(
  inner: LlmProvider,
  task: TaskEvents,
  turns: TurnCounter,
): LlmProvider {
  return {
    async complete(request, observer) {
      const response = await inner.complete(request, observer);
      turns.value += 1;
      const { inputTokens, outputTokens } = response.usage;
      await task.events.emit(
        'agent.turn',
        { turn: turns.value, inputTokens, outputTokens },
        task.agentTaskId,
      );
      await task.onAnswer(response);
      return response;
    },
  };
}

// RF-1002
export function toolsWithEvents(
  inner: AgentTools,
  task: TaskEvents,
  turns: TurnCounter,
): AgentTools {
  const { events, agentTaskId } = task;
  return {
    definitions: inner.definitions,
    areaOverview: () => inner.areaOverview(),
    readableAreaFiles: () => inner.readableAreaFiles(),
    renderBlock: (source, text) => inner.renderBlock(source, text),
    async run(call, ids) {
      const turn = turns.value;
      const tool = call.name.slice(0, MAX_TOOL_NAME);
      const args = shownArguments(call.arguments);
      await events.emit('agent.tool.called', { turn, tool, args }, agentTaskId);
      const outcome = await inner.run(call, ids);
      const refused = outcome.error === undefined ? {} : { refusedReason: outcome.error.code };
      await events.emit(
        'agent.tool.result',
        { turn, tool, ok: outcome.error === undefined, ...refused },
        agentTaskId,
      );
      return outcome;
    },
  };
}
