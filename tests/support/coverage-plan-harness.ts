import { join } from 'node:path';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';

// RF-627, ADR-008: the recording of the plan run with another seventh answer (the links of the task
// cards to the items they build), or with a plan that has no task. The calls before the seventh are
// those of tests/recordings/fake/planner-package.json.

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');

async function base(): Promise<Recording> {
  return loadRecording(recordingPath);
}

function responseOf(recording: Recording, at: number) {
  const attempt = recording.calls[at]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) {
    throw new Error(`The recording has no answer at call ${String(at + 1)}`);
  }
  return attempt.response;
}

/** The coverage recording with this text as the planner's answer. */
export async function withCoverageAnswer(text: string): Promise<Recording> {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-coverage.json'),
  );
  const response = { ...responseOf(recording, 0), text };
  return { ...recording, calls: [{ attempts: [{ response }] }] };
}

async function withPlan(
  patch: Record<string, unknown> | ((plan: Record<string, unknown>) => Record<string, unknown>),
): Promise<Recording> {
  const recording = await base();
  const first = responseOf(recording, 0);
  const body = first.text.replace(/^```json\n/u, '').replace(/\n```\s*$/u, '');
  const plan: unknown = JSON.parse(body);
  if (typeof plan !== 'object' || plan === null) throw new Error('The plan is an object');
  const changes = typeof patch === 'function' ? patch({ ...plan }) : patch;
  const text = JSON.stringify({ ...plan, ...changes });
  const calls = [{ attempts: [{ response: { ...first, text } }] }, ...recording.calls.slice(1)];
  return { ...recording, calls };
}

/** The recording whose plan has no task card at all. */
export function withoutTasks(): Promise<Recording> {
  return withPlan({ tasks: [] });
}

/** The recording whose plan has no phase, so every task card is in a phase that does not exist. */
export function withoutPhases(): Promise<Recording> {
  return withPlan({ phases: [] });
}

/** The recording whose plan has these task cards (the other parts of the plan stay). */
export function withTasks(tasks: readonly unknown[]): Promise<Recording> {
  return withPlan({ tasks });
}

/** P5-40: the recording whose phases are named like this, in order (the cards stay where they are). */
export function withPhaseNames(names: readonly string[]): Promise<Recording> {
  return withPlan((plan) => {
    const phases = Array.isArray(plan['phases']) ? (plan['phases'] as unknown[]) : [];
    return {
      phases: phases.map((phase, at) => ({ ...(phase as object), name: names[at] ?? 'Phase' })),
    };
  });
}
