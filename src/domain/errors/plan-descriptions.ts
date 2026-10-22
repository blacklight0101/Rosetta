import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007, RF-008, RF-604, RF-608, RF-609: the plain message and the next step of the plan codes
// (RST-1800..1899), in numeric order. descriptions.ts merges them with the rest; describeError
// there is the only way to read them.

export type PlanErrorCode = Extract<ErrorCode, `RST-18${string}`>;

export const PLAN_ERROR_DESCRIPTIONS: Readonly<Record<PlanErrorCode, ErrorDescription>> = {
  'RST-1800': {
    message: 'The planner did not give usable architecture and stack options.',
    nextStep:
      'Ask for the options again; if it keeps failing, make sure the project has verified cards or choose another planner model.',
  },
  'RST-1801': {
    message: 'The project has no saved planning brief, so no package was written.',
    nextStep: 'Open Plan setup, save the brief (the defaults are fine), then write the package.',
  },
  'RST-1802': {
    message:
      'The project has no finished understand run with a supported claim, so there is nothing to plan from.',
    nextStep: 'Run understand to its end, check the claims, then write the package again.',
  },
  'RST-1803': {
    message:
      'The planner did not answer with a usable plan: its answer could not be read, or no requirement it wrote names a supported card.',
    nextStep:
      'Write the package again, or choose a more capable model for the planner role in the project settings.',
  },
  'RST-1804': {
    message: 'The hand-off package of this run could not be written.',
    nextStep: 'Check the free space of the data folder, then write the package again.',
  },
  'RST-1805': {
    message:
      'The planner answer was cut off at the output limit, even after it was asked to continue.',
    nextStep:
      'Raise Planner max output tokens in Project settings (up to the maximum of the planner model, 32,768 when none is listed), or choose a planner model that writes longer answers, then write the package again.',
  },
  'RST-1806': {
    message:
      'The hand-off package was written, but some feature, table, operation, journey or screen in it is built by no task card, so the plan is not complete.',
    nextStep:
      'Open checks.md in the package to see the items no task card builds, then write the package again.',
  },
};
