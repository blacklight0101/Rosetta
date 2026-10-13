import { join } from 'node:path';
import type { LlmProvider } from '../../../src/application/ports/llm-provider.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { AnsweringProvider } from '../../support/answering-provider.js';
import { ScriptedProvider } from '../../support/scripted-provider.js';

// ADR-008, RF-407, P1-34, P1-35: the model double of the end-to-end server. Calls about the
// `octo/webforms` repository (its areas are known to the script) replay the recorded understand run
// of the C# fixture, answered by area and turn so several users can run at once; every other call is
// answered by the answering provider (RF-407; the first reader call of an understand run is held
// for a few seconds so a queue can be shown, P1-34).

/** The recorded calls that answer each area of `understand-csharp-full.json`, in turn order. */
const WEBFORMS_SCRIPT = {
  '(root)': [0, 1],
  Catalog: [2],
  Controllers: [3],
  Database: [4],
  Services: [5, 6, 7],
} as const;

/** Each recorded call waits this long, so a page can be seen between the steps of an agent. */
const STEP_DELAY_MS = 700;

/** The area whose reader never answers until the run is stopped (the Stop journey). */
const HELD_AREA = 'Controllers';

export async function createE2eProvider(): Promise<LlmProvider> {
  const answering = new AnsweringProvider(['summariser'], 8000);
  const scripted = new ScriptedProvider({
    recording: await loadRecording(
      join('tests', 'recordings', 'fake', 'understand-csharp-full.json'),
    ),
    script: WEBFORMS_SCRIPT,
    delayMs: STEP_DELAY_MS,
    hold: HELD_AREA,
  });
  return {
    complete: (request) =>
      scripted.handles(request) ? scripted.complete(request) : answering.complete(request),
  };
}
