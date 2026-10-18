import { join } from 'node:path';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';
import { separateFrontEnd } from './api-plan-harness.js';
import { customerCard, flowCard, planCards, planQuestions } from './plan-cards.js';
import { orderScreenCards } from './plan-screen-cards.js';
import { createPlanHarness, type PlanHarness, type PlanHarnessOptions } from './plan-harness.js';

// RF-626, ADR-008: a plan run whose brief names a React front end, over FEAT, FLOW, ENT and SCRN
// cards, replaying the sixth planner answer of tests/recordings/fake/planner-package.json (the
// plan, the PRD, the data model, the flows, the API contract and then the screens).

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');

type Cards = Parameters<PlanHarness['understandRun']>[0]['cards'];

export interface UxPlanOptions {
  readonly recording?: Recording;
  readonly cards?: Cards;
  readonly harness?: PlanHarnessOptions;
}

/** The text as a reader sees it: the escaper's backslashes removed. */
export function plain(text: string | undefined): string {
  return (text ?? '').replaceAll('\\', '');
}

/** The files of the package under `ux/`. */
export function uxFilesOf(files: Readonly<Record<string, string>>): string[] {
  return Object.keys(files)
    .filter((path) => path.startsWith('ux/'))
    .sort();
}

/** Cards that make every planner call: the seeded run, a customer, a flow and the order screens. */
export function allCallCards(): Cards {
  return [...planCards(), customerCard(), flowCard(), ...orderScreenCards()];
}

export async function seededUxPlan(
  dataDir: string,
  options: UxPlanOptions = {},
): Promise<PlanHarness> {
  const recording = options.recording ?? (await loadRecording(recordingPath));
  const h = await createPlanHarness(dataDir, recording, options.harness);
  await h.understandRun({ cards: options.cards ?? allCallCards(), questions: planQuestions });
  await h.saveBrief(separateFrontEnd);
  return h;
}

/** The recording with another text as the planner's sixth answer (the screens). */
export async function withUxAnswer(text: string): Promise<Recording> {
  const base = await loadRecording(recordingPath);
  const attempt = base.calls[5]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) {
    throw new Error('The recording has six calls');
  }
  const sixth = { attempts: [{ response: { ...attempt.response, text } }] };
  return { ...base, calls: [...base.calls.slice(0, 5), sixth] };
}
