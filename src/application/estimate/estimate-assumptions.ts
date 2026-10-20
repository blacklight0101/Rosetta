import { MERGE_BATCH_TOKENS } from '../consolidate/merge-request.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { ProjectSettings } from '../projects/project-settings.js';
import { readerParallelism, readerTaskSettings } from '../understand/reader-settings.js';
import type { ByScenario, ReaderAssumptions, Scenario } from './estimate-types.js';

// RF-425, ADR-007, DEC-117: the assumptions of the estimate. The reader limits (turns, output,
// context, parallelism) are the ones the understand run uses, so the estimate and the run cannot
// disagree about them. The shares are the guesses RNF-012 calibrates over real runs: a low case
// that reads half of each area in a third of the turns, a likely case, and a high case that uses
// every turn. All of them are shown with the estimate.

/** Of the reader's `maxTurns`, in percent. */
const TURNS_PERCENT: ByScenario<number> = { low: 30, likely: 60, high: 100 };
/** Of the reader's `maxOutputTokens` answered on a turn, in percent. */
const OUTPUT_PERCENT: ByScenario<number> = { low: 15, likely: 30, high: 60 };
/** Of an area's estimated tokens the reader reads, in percent. */
const READ_PERCENT: ByScenario<number> = { low: 50, likely: 80, high: 100 };
/** The verifier's tokens as a share of the readers', in percent (ADR-005). */
const VERIFIER_PERCENT: ByScenario<number> = { low: 15, likely: 30, high: 50 };
/** The summariser's tokens as a share of the readers': it reads cards, not code (RF-250). */
const SUMMARISER_PERCENT: ByScenario<number> = { low: 5, likely: 10, high: 20 };
/** The overview the summariser writes after the run (RF-264), in output tokens. */
const OVERVIEW_OUTPUT_TOKENS: ByScenario<number> = { low: 800, likely: 1500, high: 3000 };
/** The flows or the screens fragment of the reader prompt (RF-260, RF-261), more than its size. */
const SURFACE_PROMPT_TOKENS = 900;
/** The workbook guidance of the reader prompt (RF-155), more than its size. */
export const WORKBOOK_PROMPT_TOKENS = 1100;
/** The cards of one kind a marked area writes besides its other cards, in output tokens. */
const SURFACE_OUTPUT_TOKENS: ByScenario<number> = { low: 300, likely: 800, high: 2000 };
/** The system prompt and the tool definitions every turn resends. */
const PROMPT_OVERHEAD_TOKENS = 2000;
/**
 * The verifier calls one screen adds for the claims of its SCRN card (RF-626, DEC-147): one for its
 * route, two for its roles, four for its fields and two for its links. A guess, like the shares above,
 * that RNF-012 calibrates over real runs; a screen with no claims of these kinds adds none.
 */
const VERIFIER_CALLS_PER_SCREEN = 9;
/** One judgement of a claim already written: its claim and cited lines in, a reason and a verdict out (DEC-145). */
export const JUDGE_INPUT_TOKENS: ByScenario<number> = { low: 600, likely: 1000, high: 1600 };
/** The output of one such judgement: its reason and its verdict, in output tokens (DEC-145). */
export const JUDGE_OUTPUT_TOKENS: ByScenario<number> = { low: 60, likely: 100, high: 200 };

/** A share of a whole number, in percent, rounded up so a figure is never under-counted. */
export function ceilPercent(value: number, percent: number): number {
  return Math.floor((value * percent + 99) / 100);
}

function eachScenario(figure: (scenario: Scenario) => number): ByScenario<number> {
  return { low: figure('low'), likely: figure('likely'), high: figure('high') };
}

// RF-425, DEC-117
export function assumptionsOf(settings: ProjectSettings): ReaderAssumptions {
  const { reader } = settings.roles;
  const provider = Object.hasOwn(settings.providers, reader.provider)
    ? settings.providers[reader.provider]
    : undefined;
  if (provider === undefined) {
    throw new RosettaError(ERROR_CODES.settingsProviderUnknown);
  }
  const role = { name: reader.provider, kind: provider.kind, ...reader };
  const task = readerTaskSettings(settings, role);
  return {
    turnsPerArea: eachScenario((scenario) =>
      Math.max(1, ceilPercent(task.maxTurns, TURNS_PERCENT[scenario])),
    ),
    outputTokensPerTurn: eachScenario((scenario) =>
      Math.max(1, ceilPercent(reader.maxOutputTokens, OUTPUT_PERCENT[scenario])),
    ),
    readSharePercent: READ_PERCENT,
    verifierSharePercent: VERIFIER_PERCENT,
    verifierCallsPerScreen: VERIFIER_CALLS_PER_SCREEN,
    summariserSharePercent: SUMMARISER_PERCENT,
    overviewOutputTokens: OVERVIEW_OUTPUT_TOKENS,
    summariserBatchTokens: MERGE_BATCH_TOKENS,
    promptOverheadTokens: PROMPT_OVERHEAD_TOKENS,
    surfacePromptTokens: SURFACE_PROMPT_TOKENS,
    workbookPromptTokens: WORKBOOK_PROMPT_TOKENS,
    surfaceOutputTokens: SURFACE_OUTPUT_TOKENS,
    contextLimitTokens: Math.floor(task.contextTokens * task.contextShare),
    parallelism: readerParallelism(settings),
    cachedInputPercent: 0,
  };
}
