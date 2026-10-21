import { join } from 'node:path';
import {
  loadRecording,
  type Recording,
} from '../../src/infrastructure/providers/fake/recording.js';

// Q-45, RF-627, ADR-008: the recording of the planner's call for the items no task card builds.
// The harness answers it with no card by default, so a run with a gap still ends RST-1806; a test
// that wants the gap closed replays tests/recordings/fake/planner-gap.json or its own text.

const closingPath = join('tests', 'recordings', 'fake', 'planner-gap.json');

/** The recording whose answers are these texts, one per call of the gap round (the call, then a repair). */
export function gapRecordingOfAll(...texts: readonly string[]): Recording {
  return {
    schemaVersion: 1,
    description: 'Q-45: the planner answers the call for the items no task card builds.',
    calls: texts.map((text, index) => ({
      attempts: [
        {
          response: {
            text,
            toolCalls: [],
            usage: {
              ...{ inputTokens: 900, outputTokens: 300, cachedInputTokens: 0 },
              usageSource: 'reported',
            },
            finishReason: 'stop',
            requestId: `fake-request-${String(8 + index)}`,
            modelVersion: 'fake-model-2026-10-01',
          },
        },
      ],
    })),
  };
}

/** The recording whose one answer is this text. */
export function gapRecordingOf(text: string): Recording {
  return gapRecordingOfAll(text);
}

/** No task card for the gaps. */
export function noGapCards(): Recording {
  return gapRecordingOf('{"tasks": []}');
}

/** The recorded answer that writes the cards for the gaps of the demo package. */
export function closingGapRecording(): Promise<Recording> {
  return loadRecording(closingPath);
}

/** Q-54: the recorded answer of a small model that writes positions as objects (`{"position": 3}`). */
export function objectPositionsGapRecording(): Promise<Recording> {
  return loadRecording(join('tests', 'recordings', 'fake', 'planner-gap-positions.json'));
}
