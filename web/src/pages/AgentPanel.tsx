import type { JSX } from 'preact';
import { StatusBadge } from '../components/StatusBadge.js';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import type { AgentPanelState, ToolNow } from '../lib/live-run/run-state.js';

// RF-1002, design-system.md section 14 (live run): one panel per agent with its area, role, model,
// state, the tool call in progress, turns, files read, tokens, cost and the cards found so far. Every
// value comes from run events and is shown as text.

const toolStatusWords: Readonly<Record<ToolNow['status'], string>> = {
  running: 'in progress',
  ok: 'answered',
  failed: 'refused',
};

function Now({ agent }: { readonly agent: AgentPanelState }): JSX.Element {
  const { tool } = agent;
  if (tool === undefined) {
    return (
      <p class="rst-live-panel__now" data-testid="agent-now">
        {agent.state === 'Planned' ? 'Waiting to start' : 'No tool call yet'}
      </p>
    );
  }
  return (
    <p class="rst-live-panel__now rst-mono" data-testid="agent-now">
      <span>{tool.text}</span>{' '}
      <span class="rst-live-panel__status">{toolStatusWords[tool.status]}</span>
    </p>
  );
}

function Facts({ agent }: { readonly agent: AgentPanelState }): JSX.Element {
  return (
    <dl class="rst-live-panel__facts">
      <div>
        <dt>Turns</dt>
        <dd>{agent.turn}</dd>
      </div>
      <div>
        <dt>Files read</dt>
        <dd>{agent.filesRead.length}</dd>
      </div>
      <div>
        <dt>Tokens</dt>
        <dd>{tokensLabel(agent.inputTokens + agent.outputTokens)}</dd>
      </div>
      <div>
        <dt>Cost</dt>
        <dd
          title={
            agent.costMicros === undefined ? 'The cost of an agent is not reported yet.' : undefined
          }
        >
          {agent.costMicros === undefined ? '—' : costLabel(agent.costMicros)}
        </dd>
      </div>
    </dl>
  );
}

/** The colour of a role is a class; a role the design does not name uses the reader's. */
function roleClass(role: string): string {
  return ['verifier', 'planner', 'summariser'].includes(role) ? role : 'reader';
}

// RF-1002
export function AgentPanel({ agent }: { readonly agent: AgentPanelState }): JSX.Element {
  const area = agent.area === '' ? agent.agentTaskId : agent.area;
  return (
    <article
      class={`rst-live-panel rst-live-panel--${roleClass(agent.role)}`}
      aria-label={`Agent ${area}`}
      data-testid="agent-panel"
    >
      <header class="rst-live-panel__head">
        <strong class="rst-mono rst-live-panel__area">{area}</strong>
        <span class="rst-live-panel__role">{agent.role}</span>
        <StatusBadge list="AgentTaskState" value={agent.state} />
      </header>
      <p class="rst-mono rst-live-panel__model">
        {agent.model === '' ? 'model not named' : agent.model}
      </p>
      <Now agent={agent} />
      <Facts agent={agent} />
      {agent.cards.length === 0 ? null : (
        <ul class="rst-live-panel__cards" aria-label="Cards found so far">
          {agent.cards.map((card) => (
            <li key={card.cardId} class="rst-live-chip" title={card.title}>
              {card.cardId}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
