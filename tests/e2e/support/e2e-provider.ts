import { join } from 'node:path';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../src/application/ports/llm-provider.js';
import type { Recording } from '../../../src/infrastructure/providers/fake/recording.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { AnsweringProvider } from '../../support/answering-provider.js';
import { ScriptedProvider } from '../../support/scripted-provider.js';

// ADR-008, RF-407, P1-34, P1-35: the model double of the end-to-end server. Calls about the
// `octo/webforms` repository (its areas are known to the script) replay the recorded understand run
// of the C# fixture, answered by area and turn so several users can run at once; every other call is
// answered by the answering provider (RF-407; the first reader call of an understand run is held
// for a few seconds so a queue can be shown, P1-34). The `verifier` role (RF-301) answers the
// claims of that run from the recorded judgement, by the claim its call names.

/** The recorded calls that answer each area of `understand-csharp-full.json`, in turn order. */
const WEBFORMS_SCRIPT = {
  '(root)': [0, 1],
  Catalog: [2, 3],
  Controllers: [4, 5],
  Database: [6, 7],
  Services: [8, 9, 10],
} as const;

/** The recorded verdict of each claim of the webforms run, in `verifier-csharp-full.json`. */
const VERDICT_SCRIPT: Readonly<Record<string, number>> = {
  'verifier-FEAT-001.c1': 0,
  'verifier-OQ-001.c1': 1,
  'verifier-BR-001.c1': 2,
  'verifier-ENT-001.c1': 3,
  'verifier-BR-002.c1': 4,
};

/** The recorded verdict of a verifier call of the webforms run, or undefined for any other call. */
function verdictOf(recording: Recording, request: LlmRequest): LlmResponse | undefined {
  if (request.context.role !== 'verifier') return undefined;
  const { agentTaskId } = request.context;
  const index = Object.hasOwn(VERDICT_SCRIPT, agentTaskId)
    ? VERDICT_SCRIPT[agentTaskId]
    : undefined;
  const attempt = index === undefined ? undefined : recording.calls[index]?.attempts[0];
  return attempt !== undefined && 'response' in attempt ? attempt.response : undefined;
}

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
  const verdicts = await loadRecording(
    join('tests', 'recordings', 'fake', 'verifier-csharp-full.json'),
  );
  return {
    complete: (request) => {
      const verdict = verdictOf(verdicts, request);
      if (verdict !== undefined) return Promise.resolve(verdict);
      return scripted.handles(request) ? scripted.complete(request) : answering.complete(request);
    },
  };
}
