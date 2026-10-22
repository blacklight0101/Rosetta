import type { Actor } from '../../domain/accounts/actor.js';
import type { ModelList } from '../models/model-list.js';
import type { PriceTable } from '../../domain/budget/price-table.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import { CURRENT_SCANNER_VERSION, type CodeMap } from '../../domain/code-map/code-map.js';
import { areaHoldsWorkbook } from '../../domain/sources/workbook-folders.js';
import { marksOf, surfaceOf } from '../../domain/code-map/area-surface.js';
import type { Area } from '../../domain/code-map/area.js';
import { thirdPartyAreaNames } from '../../domain/code-map/third-party.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { ProviderKeyRepository } from '../ports/provider-key-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { Project } from '../projects/project.js';
import { plannedAreas } from '../understand/planned-areas.js';
import { planReaderTasks } from '../understand/reader-tasks.js';
import {
  MERGE_ANSWER_TOKENS,
  MERGE_BATCH_TOKENS,
  MERGE_PROMPT_TOKENS,
} from '../consolidate/merge-request.js';
import {
  assumptionsOf,
  ceilPercent,
  JUDGE_INPUT_TOKENS,
  JUDGE_OUTPUT_TOKENS,
} from './estimate-assumptions.js';
import type {
  ByScenario,
  ReaderAssumptions,
  EstimatePoint,
  FirstCalls,
  RunEstimate,
  Scenario,
} from './estimate-types.js';
import { readerTokens, type TokenFigures } from './reader-estimate.js';
import type { ReasoningModels } from '../models/model-list.js';
import { estimateRole } from './role-estimate.js';
import { firstCallsOf } from './first-calls.js';
import type { PlanCapDependencies } from './plan-caps.js';

// RF-425, ADR-007, DEC-13, DEC-54, DEC-107: the estimate before a run (`GET
// /api/projects/:id/estimate`). From the code map of the project's latest completed scan, the areas
// to read, the models per role and the price table it gives the tokens and cost of each role as a
// low, likely and high figure, with the assumptions stated. Costs are bigint micro-dollars like
// the ledger. A local model costs zero and still shows its tokens; a cloud model without a price
// shows its tokens and `priced: false` (RF-427). The confirmation threshold of the second RF-425
// scenario is applied by the start page to the likely figure of this estimate (P2-08, DEC-97); the
// high figure is the only one that covers the worst case of cache writes (P2-37).

export interface EstimateRunDependencies {
  readonly projects: ProjectRepository;
  readonly runs: Pick<RunIndex, 'list'>;
  readonly scans: ScanResults;
  /** Whether the user has an own key decides whether a project price override applies (DEC-107). */
  readonly keys: Pick<ProviderKeyRepository, 'find'>;
  /** The shipped price table (RF-420). */
  readonly priceTable: PriceTable;
  /** The shipped model list: the context window and the output limit of each model (Q-57). */
  readonly models: ModelList;
  /** Q-58: the models the shipped list marks as reasoning models; the estimate names their effort. */
  readonly reasoningModels: ReasoningModels;
  /** The caps the first calls are checked against (RF-405); absent for an evaluation, which has no accounts. */
  readonly caps?: PlanCapDependencies;
}

export interface EstimateRunRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** Only these areas (RF-200); every area when absent or empty. */
  readonly areas?: readonly string[];
}

export type EstimateRunProblem =
  typeof ERROR_CODES.notFound | typeof ERROR_CODES.codeMapMissing | typeof ERROR_CODES.areaUnknown;

/** The tokens of a role that is a share of the readers' (the verifier, ADR-005; the summariser, RF-250). */
export function shareTokens(
  reader: ByScenario<TokenFigures>,
  percentOf: ByScenario<number>,
): ByScenario<TokenFigures> {
  const share = (scenario: Scenario): TokenFigures => {
    const percent = percentOf[scenario];
    return {
      inputTokens: ceilPercent(reader[scenario].inputTokens, percent),
      outputTokens: ceilPercent(reader[scenario].outputTokens, percent),
      cacheWriteTokens: ceilPercent(reader[scenario].cacheWriteTokens, percent),
      // A share has fewer calls, not smaller ones: each still sends the reader's prompt (Q-56).
      promptTokens: reader[scenario].promptTokens,
    };
  };
  return { low: share('low'), likely: share('likely'), high: share('high') };
}

/**
 * RF-626, DEC-147: the tokens of `calls` more judgements of claims already written. Each one costs what
 * a judgement of the verifier costs (DEC-145), and it adds no cache write, as on a Deepen.
 */
export function withJudgements(
  tokens: ByScenario<TokenFigures>,
  calls: number,
): ByScenario<TokenFigures> {
  const judged = (scenario: Scenario): TokenFigures => ({
    ...tokens[scenario],
    inputTokens: tokens[scenario].inputTokens + calls * JUDGE_INPUT_TOKENS[scenario],
    outputTokens: tokens[scenario].outputTokens + calls * JUDGE_OUTPUT_TOKENS[scenario],
  });
  return { low: judged('low'), likely: judged('likely'), high: judged('high') };
}

/**
 * RF-626: the screens of the areas, taken to be one SCRN card for each page file the code map marks
 * (the same marks as the reader prompt, Q-25); each card adds its claims as verifier calls.
 */
function screensOf(areas: readonly Area[], codeMap: CodeMap): number {
  return areas.reduce((total, area) => total + surfaceOf(area, codeMap).pages.length, 0);
}

/**
 * RF-250, RF-264, P2-35, Q-52: the summariser's tokens. The merge is its share of the readers' tokens, and
 * each batch of cards after the first resends the merge prompt and gives an answer; the overview
 * then reads the cards once more (the same input again) and writes the overview. The cards the merge
 * is shown are taken to be its share of the readers' answers, one call for each `MERGE_BATCH_TOKENS`.
 * Only the merge writes to the cache: the extra batches and the overview add no cache-write tokens.
 */
function summariserFigures(
  reader: ByScenario<TokenFigures>,
  assumptions: ReaderAssumptions,
): { tokens: ByScenario<TokenFigures>; batches: ByScenario<number> } {
  const share = shareTokens(reader, assumptions.summariserSharePercent);
  const batch = (scenario: Scenario): number =>
    Math.max(
      assumptions.summariserMergeCalls[scenario],
      Math.ceil(share[scenario].outputTokens / MERGE_BATCH_TOKENS),
    );
  const batches = { low: batch('low'), likely: batch('likely'), high: batch('high') };
  const total = (scenario: Scenario): TokenFigures => {
    const extra = batches[scenario] - 1;
    return {
      inputTokens: share[scenario].inputTokens * 2 + extra * MERGE_PROMPT_TOKENS,
      outputTokens:
        share[scenario].outputTokens +
        extra * MERGE_ANSWER_TOKENS +
        assumptions.overviewOutputTokens[scenario],
      cacheWriteTokens: share[scenario].cacheWriteTokens,
      promptTokens: share[scenario].promptTokens,
    };
  };
  return { tokens: { low: total('low'), likely: total('likely'), high: total('high') }, batches };
}

export function sumPoints(points: readonly ByScenario<EstimatePoint>[]): ByScenario<EstimatePoint> {
  const total = (scenario: Scenario): EstimatePoint => ({
    inputTokens: points.reduce((sum, each) => sum + each[scenario].inputTokens, 0),
    outputTokens: points.reduce((sum, each) => sum + each[scenario].outputTokens, 0),
    costMicros: points.reduce((sum, each) => sum + each[scenario].costMicros, 0n),
  });
  return { low: total('low'), likely: total('likely'), high: total('high') };
}

/** RF-155: the areas that hold a rendered workbook also resend the guidance and both formats. */
function workbookAreaNames(
  areas: readonly Area[],
  folders: readonly string[] | undefined,
): ReadonlySet<string> {
  return new Set(areas.filter((area) => areaHoldsWorkbook(area, folders)).map((area) => area.name));
}

/** What the estimate reads of a scan: its code map, the workbook folders and the snapshot's name. */
interface ScannedFacts {
  readonly codeMap: CodeMap;
  readonly workbookFolders: readonly string[] | undefined;
  readonly source: { readonly snapshotKey: string };
}

export class EstimateRun {
  private readonly deps: EstimateRunDependencies;

  constructor(deps: EstimateRunDependencies) {
    this.deps = deps;
  }

  // RF-425, RF-1105
  async execute(request: EstimateRunRequest): Promise<Result<RunEstimate, EstimateRunProblem>> {
    const { actor, projectId } = request;
    const project = await this.deps.projects.find(actor.userId, projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const scanned = await this.scanOf(project);
    if (scanned === undefined) return err(ERROR_CODES.codeMapMissing);
    const { codeMap, workbookFolders } = scanned;
    const tasks = planReaderTasks(plannedAreas(scanned), request.areas);
    if (!tasks.ok) return err(ERROR_CODES.areaUnknown);
    const areas = tasks.value.map((task) => task.area);
    const thirdParty = thirdPartyAreaNames(codeMap);
    const assumptions = assumptionsOf(project.settings, this.deps.models);
    const marks = new Map(areas.map((area) => [area.name, marksOf(area, codeMap)]));
    const workbooks = workbookAreaNames(areas, workbookFolders);
    const reader = readerTokens(areas, assumptions, marks, workbooks);
    const screenClaimCalls = screensOf(areas, codeMap) * assumptions.verifierCallsPerScreen;
    const summariser = summariserFigures(reader, assumptions);
    const roles = await Promise.all([
      estimateRole(this.deps, project, { role: 'reader', tokens: reader }),
      estimateRole(this.deps, project, {
        role: 'verifier',
        tokens: withJudgements(
          shareTokens(reader, assumptions.verifierSharePercent),
          screenClaimCalls,
        ),
      }),
      estimateRole(this.deps, project, {
        role: 'summariser',
        tokens: summariser.tokens,
      }),
    ]);
    return ok({
      codeMap: {
        scannerVersion: codeMap.scannerVersion ?? null,
        currentScannerVersion: CURRENT_SCANNER_VERSION,
        outdated: (codeMap.scannerVersion ?? 0) < CURRENT_SCANNER_VERSION,
      },
      priceTableVersion: this.deps.priceTable.version,
      currency: this.deps.priceTable.currency,
      areas: areas.map(({ name, estimatedTokens, files }) => ({
        ...{ name, estimatedTokens, files: files.length },
        thirdParty: thirdParty.has(name),
      })),
      assumptions: { ...assumptions, summariserBatches: summariser.batches },
      roles,
      total: sumPoints(roles.map((role) => role.points)),
      ...(await this.firstCalls(project, areas.length)),
    });
  }

  /** RF-405, DEC-159: the reservation of the first reader calls, when the caps are known. */
  private async firstCalls(
    project: Project,
    tasks: number,
  ): Promise<{ readonly firstCalls?: FirstCalls }> {
    const { caps } = this.deps;
    if (caps === undefined) return {};
    const inputs = { tasks, models: this.deps.models };
    return { firstCalls: await firstCallsOf({ ...this.deps, ...caps }, project, inputs) };
  }

  /** RF-200: the code map of the project's newest scan that ended `Completed`. */
  private async scanOf(project: Project): Promise<ScannedFacts | undefined> {
    const runs = await this.deps.runs.list(project.userId, project.id);
    const scan = runs.find((each: Run) => each.stage === 'scan' && each.endState === 'Completed');
    if (scan === undefined) return undefined;
    try {
      const { codeMap, workbookFolders, source } = await this.deps.scans.open(scan);
      return { codeMap, workbookFolders, source: { snapshotKey: source.snapshotKey } };
    } catch (error) {
      // A scan whose output is gone (RST-1203) leaves no code map to estimate from.
      if (error instanceof RosettaError && error.code === ERROR_CODES.codeMapMissing) {
        return undefined;
      }
      throw error;
    }
  }
}
