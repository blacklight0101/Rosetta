import { join } from 'node:path';
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../src/application/ports/llm-provider.js';
import type { Recording } from '../../../src/infrastructure/providers/fake/recording.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { answerMarker, consolidateModel, heldReaderModel } from './journey-models.js';
import { OVERVIEW_CALL_USAGE } from './overview-call.js';
import { AnsweringProvider } from '../../support/answering-provider.js';
import { ScriptedProvider, type ScriptedOptions } from '../../support/scripted-provider.js';

// ADR-008, RF-407, P1-34, P1-35: the model double of the end-to-end server. Calls about the
// `octo/webforms` repository (its areas are known to the script) replay the recorded understand run
// of the C# fixture, answered by area and turn so several users can run at once; every other call is
// answered by the answering provider (RF-407; the first reader call of an understand run is held
// for a few seconds so a queue can be shown, P1-34). The `verifier` role (RF-301) answers the
// claims of that run from the recorded judgement, by the claim its call names; any other claim is
// Supported. P2-13: a reader whose project model is not the default is not held, so a journey can
// run every area to the end; the model `e2e-consolidate` replays the run whose areas describe the same
// entity and rule twice (RF-250) with the summariser's recorded merges, and an area asked again with
// the answers (RF-241) is answered from the recorded re-run.

/** The recorded calls that answer each area of `understand-csharp-full.json`, in turn order. */
const WEBFORMS_SCRIPT = {
  '(root)': [0, 1],
  Catalog: [2, 3],
  Controllers: [4, 5],
  Database: [6, 7],
  Services: [8, 9, 10],
} as const;

/** The recorded calls that answer each area of `understand-consolidate.json`, in turn order. */
const MERGING_SCRIPT = {
  '(root)': [0, 1],
  Catalog: [2, 3],
  Controllers: [4, 5],
  Database: [6, 7],
  Services: [8, 9],
} as const;

/** The first user message of a call, or an empty text. */
function firstMessage(request: LlmRequest): string {
  const first = request.messages[0];
  return first?.role === 'user' ? first.content : '';
}

/** The recorded verdict of each claim of the webforms run, in `verifier-csharp-full.json`. */
const VERDICT_SCRIPT: Readonly<Record<string, number>> = {
  'verifier-FEAT-001.c1': 0,
  'verifier-OQ-001.c1': 1,
  'verifier-BR-001.c1': 2,
  'verifier-ENT-001.c1': 3,
  'verifier-BR-002.c1': 4,
};

/** The first recorded answer of a call, or undefined when it is a failure or there is none. */
function answerOf(recording: Recording, index: number | undefined): LlmResponse | undefined {
  const attempt = index === undefined ? undefined : recording.calls[index]?.attempts[0];
  return attempt !== undefined && 'response' in attempt ? attempt.response : undefined;
}

/** The recorded verdicts: those of the webforms run by claim, and Supported for any other claim. */
interface Verdicts {
  readonly webforms: Recording;
  readonly supported: Recording;
}

/** The verdict of a verifier call, or undefined for any other call (RF-301). */
function verdictOf(
  { webforms, supported }: Verdicts,
  request: LlmRequest,
): LlmResponse | undefined {
  if (request.context.role !== 'verifier') return undefined;
  const { agentTaskId } = request.context;
  const known = Object.hasOwn(VERDICT_SCRIPT, agentTaskId)
    ? VERDICT_SCRIPT[agentTaskId]
    : undefined;
  return known === undefined ? answerOf(supported, 0) : answerOf(webforms, known);
}

/**
 * RF-250: the merge the summariser answers, from the last two calls of `understand-consolidate.json`:
 * its call for the entity cards (`summariser-ent`) and for the rule cards (`summariser-br`), for a project
 * whose summariser model is `consolidateModel`.
 */
function mergeOf(recording: Recording, request: LlmRequest): LlmResponse | undefined {
  const { agentTaskId } = request.context;
  if (request.model !== consolidateModel) return undefined;
  if (agentTaskId === 'summariser-ent') return answerOf(recording, 11);
  return agentTaskId === 'summariser-br' ? answerOf(recording, 10) : undefined;
}

/**
 * RF-264: the overview the summariser writes for the webforms run, from the 13th call of
 * `understand-overview.json`, with the small usage of every other answer of the test server.
 */
function overviewOf(recording: Recording, request: LlmRequest): LlmResponse | undefined {
  if (request.context.agentTaskId !== 'summariser-overview') return undefined;
  const attempt = recording.calls[12]?.attempts[0];
  if (attempt === undefined || !('response' in attempt)) return undefined;
  return {
    ...attempt.response,
    usage: { ...OVERVIEW_CALL_USAGE, cachedInputTokens: 0, usageSource: 'reported' },
  };
}

/**
 * RF-608, RF-604: the planner. The options of Plan setup (`planner-options`) and the package of the
 * plan run (`planner-package`) are answered from their recordings; the options name the cards of the
 * webforms run, and a card the run did not verify is dropped by the page's server.
 */
function plannerOf(
  recordings: Readonly<Record<string, Recording>>,
  request: LlmRequest,
): LlmResponse | undefined {
  if (request.context.role !== 'planner') return undefined;
  const name = request.context.agentTaskId === 'planner-options' ? 'options' : 'package';
  const attempt = recordings[name]?.calls[0]?.attempts[0];
  return attempt !== undefined && 'response' in attempt ? attempt.response : undefined;
}

/** Each recorded call waits this long, so a page can be seen between the steps of an agent. */
const STEP_DELAY_MS = 700;

/** The area whose reader never answers until the run is stopped (the Stop journey). */
const HELD_AREA = 'Controllers';

/** The recorded run that replays each reader of a project: the webforms run, the merge run or the re-run. */
interface Readers {
  readonly webforms: ScriptedProvider;
  readonly merging: ScriptedProvider;
  readonly rerun: ScriptedProvider;
}

/** RF-241, RF-250: the reader double that answers a call, by the model and by the answers it carries. */
function readerFor(readers: Readers, request: LlmRequest): ScriptedProvider | undefined {
  if (request.context.role !== 'reader') return undefined;
  if (request.model === consolidateModel) return readers.merging;
  const rerun = firstMessage(request).includes(answerMarker);
  return rerun ? readers.rerun : readers.webforms;
}

async function scriptedFrom(
  file: string,
  script: ScriptedOptions['script'],
  hold?: Pick<ScriptedOptions, 'hold' | 'holdModel'>,
): Promise<ScriptedProvider> {
  return new ScriptedProvider({
    recording: await loadRecording(join('tests', 'recordings', 'fake', file)),
    script,
    delayMs: STEP_DELAY_MS,
    ...hold,
  });
}

export async function createE2eProvider(): Promise<LlmProvider> {
  const answering = new AnsweringProvider(['summariser'], 8000);
  const readers: Readers = {
    webforms: await scriptedFrom('understand-csharp-full.json', WEBFORMS_SCRIPT, {
      hold: HELD_AREA,
      holdModel: heldReaderModel,
    }),
    merging: await scriptedFrom('understand-consolidate.json', MERGING_SCRIPT),
    rerun: await scriptedFrom('understand-csharp-answers.json', { '(root)': [0, 1] }),
  };
  const verdicts: Verdicts = {
    webforms: await loadRecording(join('tests', 'recordings', 'fake', 'verifier-csharp-full.json')),
    supported: await loadRecording(
      join('tests', 'recordings', 'fake', 'verifier-all-supported.json'),
    ),
  };
  const merges = await loadRecording(
    join('tests', 'recordings', 'fake', 'understand-consolidate.json'),
  );
  const overviews = await loadRecording(
    join('tests', 'recordings', 'fake', 'understand-overview.json'),
  );
  const planner = {
    options: await loadRecording(join('tests', 'recordings', 'fake', 'plan-options.json')),
    package: await loadRecording(join('tests', 'recordings', 'fake', 'planner-package.json')),
  };
  return {
    complete: (request) => {
      const planned = plannerOf(planner, request);
      if (planned !== undefined) return Promise.resolve(planned);
      const verdict = verdictOf(verdicts, request);
      if (verdict !== undefined) return Promise.resolve(verdict);
      const merge = mergeOf(merges, request);
      if (merge !== undefined) return Promise.resolve(merge);
      const overview = overviewOf(overviews, request);
      if (overview !== undefined) return Promise.resolve(overview);
      const reader = readerFor(readers, request);
      return reader?.handles(request) === true
        ? reader.complete(request)
        : answering.complete(request);
    },
  };
}
