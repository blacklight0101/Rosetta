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

/** The recording whose plan has no task card at all. */
export async function withoutTasks(): Promise<Recording> {
  const recording = await base();
  const first = responseOf(recording, 0);
  const body = first.text.replace(/^```json\n/u, '').replace(/\n```\s*$/u, '');
  const plan: unknown = JSON.parse(body);
  if (typeof plan !== 'object' || plan === null) throw new Error('The plan is an object');
  const text = JSON.stringify({ ...plan, tasks: [] });
  const calls = [{ attempts: [{ response: { ...first, text } }] }, ...recording.calls.slice(1)];
  return { ...recording, calls };
}
