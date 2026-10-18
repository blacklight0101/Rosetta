import { join } from 'node:path';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';
import { customerCard, flowCard, planCards, planQuestions } from './plan-cards.js';
import { createPlanHarness, type PlanHarness, type PlanHarnessOptions } from './plan-harness.js';

// RF-624, RF-623, ADR-008: a plan run whose brief names a React front end, over FEAT, FLOW and ENT
// cards, replaying the fifth planner answer of tests/recordings/fake/planner-package.json.

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');

type BriefAnswers = Parameters<PlanHarness['saveBrief']>[0];
type Cards = Parameters<PlanHarness['understandRun']>[0]['cards'];

export const separateFrontEnd = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [
    { layer: 'front-end', choice: 'React', custom: false },
    { layer: 'database', choice: 'PostgreSQL', custom: false },
  ],
} as const satisfies BriefAnswers;

export interface ApiPlanOptions {
  readonly recording?: Recording;
  readonly brief?: BriefAnswers;
  readonly cards?: Cards;
  readonly harness?: PlanHarnessOptions;
}

/** The text as a reader sees it: the escaper's backslashes removed. */
export function plain(text: string | undefined): string {
  return (text ?? '').replaceAll('\\', '');
}

/** The files of the package under `api/`. */
export function apiFiles(files: Readonly<Record<string, string>>): string[] {
  return Object.keys(files).filter((path) => path.startsWith('api/'));
}

export async function seededApiPlan(
  dataDir: string,
  options: ApiPlanOptions = {},
): Promise<PlanHarness> {
  const recording = options.recording ?? (await loadRecording(recordingPath));
  const h = await createPlanHarness(dataDir, recording, options.harness);
  const cards = options.cards ?? [...planCards(), customerCard(), flowCard()];
  await h.understandRun({ cards, questions: planQuestions });
  await h.saveBrief(options.brief ?? separateFrontEnd);
  return h;
}

/** The recording with another text as the planner's fifth answer (the API contract). */
export async function withApiAnswer(text: string): Promise<Recording> {
  const base = await loadRecording(recordingPath);
  const attempt = base.calls[4]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) {
    throw new Error('The recording has five calls');
  }
  const fourth = { attempts: [{ response: { ...attempt.response, text } }] };
  return { ...base, calls: [...base.calls.slice(0, 4), fourth] };
}
