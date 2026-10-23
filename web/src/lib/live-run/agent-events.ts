import type { RunEvent } from '../../api/run-events.js';
import {
  agentData,
  agentEndedData,
  cardData,
  toolCalledData,
  toolResultData,
  turnData,
  usageData,
  type UsageData,
} from './event-data.js';
import { readPathOf, toolText } from './tool-text.js';
import type { AgentPanelState, AgentState, RunState } from './run-state.js';

// RF-1002, RF-424: what the events of an agent change in its panel. An event without an agent task
// id belongs to no panel and changes none.

type Change = (agent: AgentPanelState) => AgentPanelState;

const AGENT_STATES: readonly AgentState[] = [
  'Planned',
  'Running',
  'Done',
  'TurnLimitReached',
  'InvalidOutput',
  'Failed',
  'StoppedByCap',
];

function blankAgent(agentTaskId: string): AgentPanelState {
  return {
    ...{ agentTaskId, area: '', role: 'reader', model: '', state: 'Planned', turn: 0 },
    ...{ filesRead: [], tool: undefined, pendingRead: undefined, cards: [] },
    ...{ inputTokens: 0, outputTokens: 0, costMicros: undefined },
  };
}

/** The state with that agent changed, the agent added at the end when the page has not seen it. */
function withAgent(state: RunState, event: RunEvent, change: Change): RunState {
  const id = event.agentTaskId;
  if (id === undefined) return state;
  const known = state.agents.some((agent) => agent.agentTaskId === id);
  const agents = known ? state.agents : [...state.agents, blankAgent(id)];
  return {
    ...state,
    agents: agents.map((agent) => (agent.agentTaskId === id ? change(agent) : agent)),
  };
}

/** The identity the event names, filled in only where the panel has none yet. */
function named(agent: AgentPanelState, event: RunEvent): AgentPanelState {
  const parsed = agentData.safeParse(event.data);
  const data = parsed.success ? parsed.data : {};
  return {
    ...agent,
    area: agent.area === '' ? (data.area ?? '') : agent.area,
    role: data.role ?? agent.role,
    model: agent.model === '' ? (data.model ?? '') : agent.model,
  };
}

/** RF-209: an agent a Deepen plans belongs to the round that is on (the one with the highest number). */
function inRound(state: RunState, agent: AgentPanelState): AgentPanelState {
  const round = agent.round ?? state.deepen?.rounds.at(-1)?.round;
  return round === undefined ? agent : { ...agent, round };
}

// RF-1002, RF-209
export function onPlanned(state: RunState, event: RunEvent): RunState {
  return withAgent(state, event, (agent) => inRound(state, named(agent, event)));
}

// RF-1002, RF-209
export function onStarted(state: RunState, event: RunEvent): RunState {
  return withAgent(state, event, (agent) =>
    inRound(state, { ...named(agent, event), state: 'Running' }),
  );
}

// RF-1002, RF-1003
export function onTurn(state: RunState, event: RunEvent): RunState {
  const parsed = turnData.safeParse(event.data);
  if (!parsed.success) return state;
  const { turn, inputTokens = 0, outputTokens = 0 } = parsed.data;
  return withAgent(state, event, (agent) => ({
    ...agent,
    turn: Math.max(agent.turn, turn ?? 0),
    inputTokens: agent.inputTokens + inputTokens,
    outputTokens: agent.outputTokens + outputTokens,
  }));
}

// RF-1002
export function onToolCalled(state: RunState, event: RunEvent): RunState {
  const parsed = toolCalledData.safeParse(event.data);
  if (!parsed.success || parsed.data.tool === undefined) return state;
  const { tool, args } = parsed.data;
  return withAgent(state, event, (agent) => ({
    ...agent,
    tool: { text: toolText(tool, args), status: 'running' },
    pendingRead: readPathOf(tool, args),
  }));
}

/** The tool line once a read answered: the lines it returned, not the lines the model asked for. */
function answeredText(
  agent: AgentPanelState,
  lines: readonly [number | undefined, number | undefined],
): string {
  const text = agent.tool?.text ?? '';
  const [startLine, endLine] = lines;
  const path = agent.pendingRead;
  if (path === undefined || startLine === undefined || endLine === undefined) return text;
  return toolText('read_file', { path, startLine, endLine });
}

// RF-1002
export function onToolResult(state: RunState, event: RunEvent): RunState {
  const parsed = toolResultData.safeParse(event.data);
  if (!parsed.success) return state;
  const ok = parsed.data.ok === true;
  return withAgent(state, event, (agent) => {
    const path = agent.pendingRead;
    const read = ok && path !== undefined && !agent.filesRead.includes(path);
    const { startLine, endLine } = parsed.data;
    const text = ok ? answeredText(agent, [startLine, endLine]) : undefined;
    return {
      ...agent,
      tool:
        agent.tool === undefined
          ? undefined
          : { text: text ?? agent.tool.text, status: ok ? 'ok' : 'failed' },
      pendingRead: undefined,
      filesRead: read ? [...agent.filesRead, path] : agent.filesRead,
    };
  });
}

// RF-1002
export function onCardProposed(state: RunState, event: RunEvent): RunState {
  const parsed = cardData.safeParse(event.data);
  if (!parsed.success) return state;
  const { cardId, type = '', title = '' } = parsed.data;
  const card = { cardId, type, title };
  const known = state.cards.some((each) => each.cardId === cardId);
  const withCard = withAgent(state, event, (agent) =>
    agent.cards.some((each) => each.cardId === cardId)
      ? agent
      : { ...agent, cards: [...agent.cards, card] },
  );
  return known ? withCard : { ...withCard, cards: [...withCard.cards, card] };
}

// RF-1002
export function onAgentEnded(state: RunState, event: RunEvent): RunState {
  const parsed = agentEndedData.safeParse(event.data);
  if (!parsed.success) return state;
  const given = AGENT_STATES.find((each) => each === parsed.data.state);
  const { turns = 0 } = parsed.data;
  return withAgent(state, event, (agent) => ({
    ...agent,
    state: given ?? 'Done',
    turn: Math.max(agent.turn, turns),
  }));
}

/** A role's cost and tokens with one more call's added; what the call did not report stays. */
function withRoleUsage(state: RunState, role: string, used: UsageData): RunState {
  const { costMicros, tokens } = used;
  const roleCostMicros =
    costMicros === undefined
      ? state.roleCostMicros
      : { ...state.roleCostMicros, [role]: (state.roleCostMicros[role] ?? 0) + costMicros };
  const before = state.roleTokens[role] ?? {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
  };
  const roleTokens =
    tokens === undefined
      ? state.roleTokens
      : {
          ...state.roleTokens,
          [role]: {
            inputTokens: before.inputTokens + tokens.inputTokens,
            outputTokens: before.outputTokens + tokens.outputTokens,
            cachedInputTokens: before.cachedInputTokens + (tokens.cachedInputTokens ?? 0),
          },
        };
  return { ...state, roleCostMicros, roleTokens };
}

/**
 * RF-424, RF-1003: cost per agent, and cost and tokens per role, from the usage events. A call of no
 * agent panel (the Ollama check before the first task, RF-401) counts for its role only: usage
 * never adds a panel.
 */
export function onUsage(state: RunState, event: RunEvent): RunState {
  const parsed = usageData.safeParse(event.data);
  if (!parsed.success) return state;
  const { costMicros } = parsed.data;
  const agent = state.agents.find((each) => each.agentTaskId === event.agentTaskId);
  const withAgentCost =
    agent === undefined || costMicros === undefined
      ? state
      : withAgent(state, event, (each) => ({
          ...each,
          costMicros: (each.costMicros ?? 0) + costMicros,
        }));
  const role = parsed.data.role ?? agent?.role;
  return role === undefined ? withAgentCost : withRoleUsage(withAgentCost, role, parsed.data);
}
