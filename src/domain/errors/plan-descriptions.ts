import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007, RF-008, RF-608, RF-609: the plain message and the next step of the plan codes
// (RST-1800..1899), in numeric order. descriptions.ts merges them with the rest; describeError
// there is the only way to read them.

export type PlanErrorCode = Extract<ErrorCode, `RST-18${string}`>;

export const PLAN_ERROR_DESCRIPTIONS: Readonly<Record<PlanErrorCode, ErrorDescription>> = {
  'RST-1800': {
    message: 'The planner did not give usable architecture and stack options.',
    nextStep:
      'Ask for the options again; if it keeps failing, make sure the project has verified cards or choose another planner model.',
  },
};
