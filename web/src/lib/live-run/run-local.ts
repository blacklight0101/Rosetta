import type { RunState } from './run-state.js';

// RF-1003, P5-07: whether a run uses local models only, from the roles that `run.started` carries
// (the provider kind of each role), so the top bar meter has its unit from the first event.

/** The roles a run of the stage calls; a scan or a report calls no model. */
function rolesOf(stage: string | undefined): readonly string[] {
  if (stage === 'plan') return ['planner'];
  if (stage === 'scan' || stage === 'report' || stage === undefined) return [];
  return ['reader', 'verifier', 'summariser'];
}

// P5-07
export function runIsLocal(state: Pick<RunState, 'stage' | 'roleKinds'>): boolean {
  const roles = rolesOf(state.stage);
  return roles.length > 0 && roles.every((role) => state.roleKinds[role] === 'ollama');
}
