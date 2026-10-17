import { join } from 'node:path';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';
import { fakeResponse } from './fake-recordings.js';

// RF-200, RF-241, RF-301, ADR-008: the recordings the understand harness replays: the reader's (and
// the summariser's) for one or more runs, and the verifier's own.

/** The recording's calls `times` over, so several runs can replay it in turn. */
function repeated(recording: Recording, times: number): Recording {
  return { ...recording, calls: Array.from({ length: times }, () => recording.calls).flat() };
}

const load = (name: string): Promise<Recording> =>
  loadRecording(join('tests', 'recordings', 'fake', name));

/**
 * The summariser's answer to the one group of duplicate candidates of the first run (RF-250): no
 * merge. It stands between the first run's calls and the later runs' calls.
 */
const noMerge: Recording['calls'][number] = {
  attempts: [
    {
      response: fakeResponse({
        text: '```json\n{"merges": []}\n```',
        toolCalls: [],
        usage: {
          inputTokens: 100,
          outputTokens: 10,
          cachedInputTokens: 0,
          usageSource: 'reported',
        },
        finishReason: 'stop',
      }),
    },
  ],
};

interface RecordingNames {
  /** A file name under tests/recordings/fake/. */
  readonly recording: string;
  /** A file replayed by the runs after the replays of `recording` (the re-run with answers). */
  readonly afterwards?: string;
  /** How many understand runs replay the recording, one after the other (1 when absent). */
  readonly replays?: number;
}

/** The recording of the options: the first file replayed, then the file for later runs. */
export async function readerRecordingOf(options: RecordingNames): Promise<Recording> {
  const first = repeated(await load(options.recording), options.replays ?? 1);
  if (options.afterwards === undefined) return first;
  const later = await load(options.afterwards);
  return { ...first, calls: [...first.calls, noMerge, ...later.calls] };
}

/** RF-301: what the `verifier` role replays, when the test names a recording for it. */
export async function verifierRecordingOf(
  name: string | undefined,
): Promise<{ readonly verifierRecording?: Recording }> {
  return name === undefined ? {} : { verifierRecording: await load(name) };
}
