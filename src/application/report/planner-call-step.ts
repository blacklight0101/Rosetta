import { z } from 'zod';
import { readersStoppedStep } from './readers-stopped-step.js';

// RF-1015, RF-506, P8-12: the replay step of `plan.call.started`, so a plan run's replay shows each
// planner call. Data that does not fit its event gives no step.

const data = z.object({ call: z.string() });

/** The step of `plan.call.started`: which planner call began. */
function plannerCallStep(
  value: Record<string, unknown>,
): { readonly kind: 'agent'; readonly label: string; readonly text: string } | undefined {
  const parsed = data.safeParse(value);
  if (!parsed.success) return undefined;
  return { kind: 'agent', label: 'Planner call', text: `Planner call ${parsed.data.call} started` };
}

/** The replay handlers of the run steps that are not an agent's own: the readers stopping, a planner call. */
export const runStepHandlers = {
  'budget.readersStopped': readersStoppedStep,
  'plan.call.started': plannerCallStep,
};
