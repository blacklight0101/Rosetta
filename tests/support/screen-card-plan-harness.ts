import { join } from 'node:path';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';

// RF-627, RF-630, RF-631, ADR-008: the recorded case of the evaluation of 2026-10-21, made of
// synthetic data. The plan has thirteen requirements; 11, 12 and 13 are the invoice, masterdata and
// dashboard screens (sources SCRN-001, SCRN-002, SCRN-005). Tasks 7, 8 and 9 are the screen cards
// and carry the positions 12, 13 and 14, one too high, and the coverage call links them to the right
// screens. The plan and screens answers replace the first and sixth call of planner-package.json.

const recordingPath = join('tests', 'recordings', 'fake', 'planner-package.json');

export const screenCardLinks = JSON.stringify({
  links: [
    { task: 7, builds: ['screen:SCRN-001'] },
    { task: 8, builds: ['screen:SCRN-002'] },
    { task: 9, builds: ['screen:SCRN-005'] },
  ],
});

function responseOf(recording: Recording, at: number) {
  const attempt = recording.calls[at]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) {
    throw new Error(`The recording has no answer at call ${String(at + 1)}`);
  }
  return attempt.response;
}

function requirement(title: string, source: string) {
  return { title, statement: `${title} works as the legacy system does.`, sources: [source] };
}

function task(title: string, requirements: readonly number[]) {
  return {
    title,
    phase: 1,
    requirements,
    acceptanceCriteria: [`Given the ${title}, when it is used, then it answers as before.`],
    invariant: `The ${title} answers exactly as the legacy one did.`,
    riskClass: 'data loss',
    adds: [],
    probes: ['Use it with an empty list.'],
    files: [`src/${title.toLowerCase().replaceAll(' ', '-')}/`],
  };
}

function screen(name: string, card: string) {
  return { name, purpose: `Shows the ${name}.`, reason: 'It is a page of its own.', cards: [card] };
}

/** The recording whose plan and screens are the recorded case. */
export async function screenCardRecording(): Promise<Recording> {
  const recording = await loadRecording(recordingPath);
  const fillers = Array.from({ length: 10 }, (_, at) =>
    requirement(`Filler rule ${String(at + 1)}`, 'FEAT-001'),
  );
  const requirements = [
    ...fillers,
    requirement('Invoice screen', 'SCRN-001'),
    requirement('Masterdata screen', 'SCRN-002'),
    requirement('Dashboard screen', 'SCRN-005'),
  ];
  const tasks = [
    ...[1, 2, 3, 4, 5, 6].map((at) => task(`Filler card ${String(at)}`, [at])),
    task('Invoice screen card', [12]),
    task('Masterdata screen card', [13]),
    task('Dashboard screen card', [14]),
  ];
  const body = responseOf(recording, 0)
    .text.replace(/^```json\n/u, '')
    .replace(/\n```\s*$/u, '');
  const plan: unknown = JSON.parse(body);
  if (typeof plan !== 'object' || plan === null) throw new Error('The plan is an object');
  const text = JSON.stringify({ ...plan, requirements, tasks });
  const first = { ...responseOf(recording, 0), text };
  const screens = {
    screens: [
      screen('Invoice', 'SCRN-001'),
      screen('Masterdata', 'SCRN-002'),
      screen('Dashboard', 'SCRN-005'),
    ],
    dropped: [],
    designBrief: { audience: 'Staff', tone: 'Plain', components: ['Data table'] },
  };
  const sixth = { ...responseOf(recording, 5), text: JSON.stringify(screens) };
  const calls = [...recording.calls];
  calls[0] = { attempts: [{ response: first }] };
  calls[5] = { attempts: [{ response: sixth }] };
  return { ...recording, calls };
}
