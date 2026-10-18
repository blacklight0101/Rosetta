import { join } from 'node:path';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness, type PlanHarness } from './plan-harness.js';
import { customerCard, orderFlowCards, planCards, planQuestions } from './plan-cards.js';

// RF-625: a plan run over a seeded understand run with FLOW cards and the planner recording whose
// fourth call is the target flows, for the flows integration tests.

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');

/** The text as a reader sees it: the escaper's backslashes removed. */
export function plain(text: string): string {
  return text.replaceAll('\\', '');
}

/** The harness over the data folder, its cards seeded (FLOW cards by default) and its brief saved. */
export async function seedFlowsRun(
  dataDir: string,
  recording?: Recording,
  options: Parameters<typeof createPlanHarness>[2] = {},
  cards = [...planCards(), customerCard(), ...orderFlowCards()],
): Promise<PlanHarness> {
  const replayed = recording ?? (await loadRecording(recordingPath));
  const h = await createPlanHarness(dataDir, replayed, options);
  await h.understandRun({ cards, questions: planQuestions });
  await h.saveBrief({ migration: 'parallel-change' });
  return h;
}

/** Runs the plan and returns the files of its hand-off package. */
export async function packageFiles(h: PlanHarness): Promise<Readonly<Record<string, string>>> {
  return h.handoffOf(await h.plan());
}

/** The planner recording with another text for its fourth answer. */
export async function withFourthAnswer(text: string): Promise<Recording> {
  const base = await loadRecording(recordingPath);
  const fourth = base.calls[3]?.attempts[0];
  if (fourth === undefined || !('response' in fourth))
    throw new Error('The recording has four calls');
  return {
    ...base,
    calls: [...base.calls.slice(0, 3), { attempts: [{ response: { ...fourth.response, text } }] }],
  };
}

/** The planner recording with another text for its first answer, the plan. */
export async function withPlanAnswer(text: string): Promise<Recording> {
  const base = await loadRecording(recordingPath);
  const first = base.calls[0]?.attempts[0];
  if (first === undefined || !('response' in first)) throw new Error('The recording has a plan');
  return {
    ...base,
    calls: [{ attempts: [{ response: { ...first.response, text } }] }, ...base.calls.slice(1)],
  };
}
