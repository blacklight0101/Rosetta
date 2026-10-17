import type { Actor } from '../../domain/accounts/actor.js';
import { costOf, type Price } from '../../domain/budget/price.js';
import { lookupPrice, type KeySource, type PriceTable } from '../../domain/budget/price-table.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import { CURRENT_SCANNER_VERSION, type CodeMap } from '../../domain/code-map/code-map.js';
import { marksOf } from '../../domain/code-map/area-surface.js';
import { thirdPartyAreaNames } from '../../domain/code-map/third-party.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { ProviderKeyRepository } from '../ports/provider-key-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { Project } from '../projects/project.js';
import { priceOverridesOf } from '../projects/price-overrides.js';
import { keyProviderOf } from '../providers/key-choice.js';
import { planReaderTasks } from '../understand/reader-tasks.js';
import { assumptionsOf, ceilPercent } from './estimate-assumptions.js';
import type {
  ByScenario,
  EstimateAssumptions,
  EstimatePoint,
  EstimateRole,
  RoleEstimate,
  RunEstimate,
  Scenario,
} from './estimate-types.js';
import { readerTokens, type TokenFigures } from './reader-estimate.js';

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
}

export interface EstimateRunRequest {
  readonly actor: Actor;
  readonly projectId: string;
  /** Only these areas (RF-200); every area when absent or empty. */
  readonly areas?: readonly string[];
}

export type EstimateRunProblem =
  typeof ERROR_CODES.notFound | typeof ERROR_CODES.codeMapMissing | typeof ERROR_CODES.areaUnknown;

interface RoleTokens {
  readonly role: EstimateRole;
  readonly tokens: ByScenario<TokenFigures>;
}

/**
 * RF-425, P2-24, P2-37: the cost of one point. The high point prices the whole prompt at the highest
 * of the input and cache-write prices, as the budget guard's worst case does (RF-422), so the high
 * figure is never under the premium of cache writes. The low and likely points price the tokens the
 * tasks write to the prompt cache at the cache-write price and the rest of the prompt as input; a
 * price without a cache-write price, or one below the input price, leaves them at the input price.
 * The confirmation threshold of RF-425 is compared with the likely point (start-confirmation.ts),
 * not with the high one.
 */
function costOfPoint(
  price: Price,
  tokens: Pick<TokenFigures, 'inputTokens' | 'outputTokens' | 'cacheWriteTokens'>,
  scenario: Scenario,
): bigint {
  const { inputTokens, outputTokens } = tokens;
  const plain = costOf(price, { inputTokens, outputTokens, cachedInputTokens: 0 }).micros;
  const written = scenario === 'high' ? inputTokens : tokens.cacheWriteTokens;
  const withWrites = costOf(price, {
    ...{ inputTokens, outputTokens, cachedInputTokens: 0 },
    cacheWriteInputTokens: written,
  }).micros;
  return withWrites > plain ? withWrites : plain;
}

/** The tokens of a role that is a share of the readers' (the verifier, ADR-005; the summariser, RF-250). */
function shareTokens(
  reader: ByScenario<TokenFigures>,
  percentOf: ByScenario<number>,
): ByScenario<TokenFigures> {
  const share = (scenario: Scenario): TokenFigures => {
    const percent = percentOf[scenario];
    return {
      inputTokens: ceilPercent(reader[scenario].inputTokens, percent),
      outputTokens: ceilPercent(reader[scenario].outputTokens, percent),
      cacheWriteTokens: ceilPercent(reader[scenario].cacheWriteTokens, percent),
    };
  };
  return { low: share('low'), likely: share('likely'), high: share('high') };
}

/**
 * The summariser merges duplicates (a share of the readers' tokens, RF-250) and then reads the cards
 * once more to write the overview (RF-264): the same input again, and the overview as output.
 */
function summariserTokens(
  reader: ByScenario<TokenFigures>,
  assumptions: EstimateAssumptions,
): ByScenario<TokenFigures> {
  const merge = shareTokens(reader, assumptions.summariserSharePercent);
  const total = (scenario: Scenario): TokenFigures => ({
    inputTokens: merge[scenario].inputTokens * 2,
    outputTokens: merge[scenario].outputTokens + assumptions.overviewOutputTokens[scenario],
    // The overview call is a plain call (no cached prefix of its own): only the merge writes cache.
    cacheWriteTokens: merge[scenario].cacheWriteTokens,
  });
  return { low: total('low'), likely: total('likely'), high: total('high') };
}

function sumPoints(points: readonly ByScenario<EstimatePoint>[]): ByScenario<EstimatePoint> {
  const total = (scenario: Scenario): EstimatePoint => ({
    inputTokens: points.reduce((sum, each) => sum + each[scenario].inputTokens, 0),
    outputTokens: points.reduce((sum, each) => sum + each[scenario].outputTokens, 0),
    costMicros: points.reduce((sum, each) => sum + each[scenario].costMicros, 0n),
  });
  return { low: total('low'), likely: total('likely'), high: total('high') };
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
    const codeMap = await this.codeMapOf(project);
    if (codeMap === undefined) return err(ERROR_CODES.codeMapMissing);
    const tasks = planReaderTasks(codeMap.areas, request.areas);
    if (!tasks.ok) return err(ERROR_CODES.areaUnknown);
    const areas = tasks.value.map((task) => task.area);
    const thirdParty = thirdPartyAreaNames(codeMap);
    const assumptions = assumptionsOf(project.settings);
    const marks = new Map(areas.map((area) => [area.name, marksOf(area, codeMap)]));
    const reader = readerTokens(areas, assumptions, marks);
    const roles = await Promise.all([
      this.roleOf(project, { role: 'reader', tokens: reader }),
      this.roleOf(project, {
        role: 'verifier',
        tokens: shareTokens(reader, assumptions.verifierSharePercent),
      }),
      this.roleOf(project, {
        role: 'summariser',
        tokens: summariserTokens(reader, assumptions),
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
      assumptions,
      roles,
      total: sumPoints(roles.map((role) => role.points)),
    });
  }

  /** RF-200: the code map of the project's newest scan that ended `Completed`. */
  private async codeMapOf(project: Project): Promise<CodeMap | undefined> {
    const runs = await this.deps.runs.list(project.userId, project.id);
    const scan = runs.find((each: Run) => each.stage === 'scan' && each.endState === 'Completed');
    if (scan === undefined) return undefined;
    try {
      return (await this.deps.scans.open(scan)).codeMap;
    } catch (error) {
      // A scan whose output is gone (RST-1203) leaves no code map to estimate from.
      if (error instanceof RosettaError && error.code === ERROR_CODES.codeMapMissing) {
        return undefined;
      }
      throw error;
    }
  }

  // RF-425, RF-420, RF-427, DEC-107
  private async roleOf(project: Project, { role, tokens }: RoleTokens): Promise<RoleEstimate> {
    const { settings } = project;
    const { provider: name, model } = settings.roles[role];
    const config = Object.hasOwn(settings.providers, name) ? settings.providers[name] : undefined;
    if (config === undefined) throw new RosettaError(ERROR_CODES.settingsProviderUnknown);
    const keySource = await this.keySourceOf(project.userId, config.kind);
    const lookup = lookupPrice(this.deps.priceTable, priceOverridesOf(settings), {
      provider: config.kind,
      model,
      keySource,
    });
    const pointOf = (scenario: Scenario): EstimatePoint => {
      const { inputTokens, outputTokens } = tokens[scenario];
      const costMicros =
        lookup.kind === 'priced' ? costOfPoint(lookup.price, tokens[scenario], scenario) : 0n;
      return { inputTokens, outputTokens, costMicros };
    };
    return {
      ...{ role, provider: name, kind: config.kind, model, keySource },
      priced: lookup.kind === 'priced',
      points: { low: pointOf('low'), likely: pointOf('likely'), high: pointOf('high') },
    };
  }

  /** The user's own key when they hold one, else the server's; a local provider takes none. */
  private async keySourceOf(userId: string, kind: RoleEstimate['kind']): Promise<KeySource> {
    const keyProvider = keyProviderOf(kind);
    if (keyProvider === undefined) return 'none';
    return (await this.deps.keys.find(userId, keyProvider)) === undefined ? 'server' : 'user';
  }
}
