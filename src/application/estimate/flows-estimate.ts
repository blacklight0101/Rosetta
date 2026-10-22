import type { DraftComponent } from '../../domain/planning/plan-draft.js';
import { RESPONSIBILITY_CHARS } from '../plan/flows-message.js';

// RF-613, RF-625, ADR-007: the components the flows call will be sent are the plan's own answer,
// which does not exist before the run. The estimate sizes that block at the limits of the plan
// answer (plan-answer.ts: at most 50 components, a name of at most 200 characters) and of the
// message (a responsibility cut at `RESPONSIBILITY_CHARS`), so the figure is an upper bound of
// the input and the high figure stays the guard's worst case.
const MAX_COMPONENTS = 50;
const MAX_NAME = 200;
// A control character is six characters once JSON-escaped (\u0001), the most a character of model
// text can cost in the message, so the block is an upper bound whatever the plan names.
const ESCAPED = String.fromCharCode(1);

// RF-613, RF-625
export function assumedComponents(): DraftComponent[] {
  return Array.from({ length: MAX_COMPONENTS }, (_, index) => ({
    name: String(index).padEnd(MAX_NAME, ESCAPED),
    responsibility: ESCAPED.repeat(RESPONSIBILITY_CHARS),
    role: '',
    dependsOn: [],
  }));
}
