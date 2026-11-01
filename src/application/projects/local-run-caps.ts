import type { ProjectSettings } from './project-settings.js';

// RF-433, DEC-197: "No cap for local models". With the project setting on, a run whose every role
// is on a local provider (a kind the price table prices at zero) has no token cap and no pause at
// its approved amount; the budget guard still meters every call, and the administrator ceilings
// of the run caps and the day, month and role caps stay hard limits (DEC-112). One cloud role
// keeps every cap and the pause of RF-432.

/** RF-433: the run on these settings is free of the project's run caps and of the pause. */
// RF-433
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the red stub of P7-06
export function uncappedLocalRun(_settings: ProjectSettings): boolean {
  return false;
}
