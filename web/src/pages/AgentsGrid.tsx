import type { JSX } from 'preact';
import type { AgentPanelState, RunState } from '../lib/live-run/run-state.js';
import { AgentPanel } from './AgentPanel.js';

// RF-1002, design-system.md section 14 (live run): one panel per agent, or the line that says why
// there are none.

export function AgentsGrid(props: {
  readonly state: RunState;
  /** Only the agents of this area (a tile of the code map was opened). */
  readonly area?: string | undefined;
}): JSX.Element {
  const { state, area } = props;
  const agents: readonly AgentPanelState[] =
    area === undefined ? state.agents : state.agents.filter((agent) => agent.area === area);
  const emptyText =
    state.stage === 'scan'
      ? 'This run has no agents. A scan reads the repository without a model.'
      : 'No agents yet. They appear when the run plans its work.';
  return (
    <section class="rst-live-agents" aria-label="Agents">
      <h2 class="rst-live-section__title">Agents</h2>
      {agents.length === 0 ? (
        <p class="rst-settings__note">{emptyText}</p>
      ) : (
        <div class="rst-live-agents__grid">
          {agents.map((agent) => (
            <AgentPanel key={agent.agentTaskId} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
}
