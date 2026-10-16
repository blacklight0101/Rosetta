import type { AgentPanelState, ClaimRow, RunState } from './run-state.js';

// RF-1015, DEC-137: "working now": up to three agents, in plain words. A reader that is working says
// what it opens or what it wrote last; the citation check says how many claims it has checked. Text
// comes from the events (paths, card titles) and is shown as text.

export interface WorkingItem {
  readonly key: string;
  readonly role: string;
  readonly title: string;
  readonly text: string;
}

const MAX_ITEMS = 3;
const READ_FILE = /^read_file (.+?)(?::(\d+)-(\d+))?$/u;

const roleWords: Readonly<Record<string, string>> = {
  reader: 'Reader',
  verifier: 'Verifier',
  planner: 'Planner',
  summariser: 'Summariser',
};

function roleWord(role: string): string {
  return roleWords[role] ?? role;
}

function readingText(text: string): string | undefined {
  const [, path, start, end] = READ_FILE.exec(text) ?? [];
  if (path === undefined) return undefined;
  return start === undefined || end === undefined
    ? `Reading ${path}`
    : `Reading ${path}, lines ${start}–${end}`;
}

/** What a working agent is doing, in a sentence. */
function sentenceOf(agent: AgentPanelState): string {
  const { tool } = agent;
  if (tool?.status === 'running') return readingText(tool.text) ?? `Using ${tool.text}`;
  const last = agent.cards.at(-1);
  if (last !== undefined) return `Wrote a card: ${last.title}`;
  return agent.turn === 0 ? 'Starting' : 'Thinking about what to read next';
}

function checkText(claims: readonly ClaimRow[]): string {
  const checked = claims.filter((claim) => claim.status !== 'Proposed');
  const invalid = checked.filter((claim) => claim.status === 'CitationInvalid').length;
  const count = `${String(checked.length)} ${checked.length === 1 ? 'claim' : 'claims'} checked`;
  return invalid === 0
    ? `${count}, all cite real lines`
    : `${count}, ${String(invalid)} with a bad citation`;
}

function checkItem(state: RunState): WorkingItem | undefined {
  if (!state.claims.some((claim) => claim.status !== 'Proposed')) return undefined;
  return {
    key: 'citation-check',
    role: 'verifier',
    title: 'Citation check',
    text: checkText(state.claims),
  };
}

// RF-1015
export function workingNowOf(state: RunState): readonly WorkingItem[] {
  const check = checkItem(state);
  const room = check === undefined ? MAX_ITEMS : MAX_ITEMS - 1;
  const agents = state.agents
    .filter((agent) => agent.state === 'Running')
    .slice(0, room)
    .map((agent) => ({
      key: agent.agentTaskId,
      role: agent.role,
      title: `${roleWord(agent.role)} · ${agent.area === '' ? agent.agentTaskId : agent.area}`,
      text: sentenceOf(agent),
    }));
  return check === undefined ? agents : [...agents, check];
}
