import { costOf, priceAt, type Price } from '../../domain/budget/price.js';
import { lookupPrice, type KeySource, type PriceTable } from '../../domain/budget/price-table.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { ReasoningModels } from '../models/model-list.js';
import type { ReasoningEffort } from '../ports/llm-provider.js';
import type { ProviderKeyRepository } from '../ports/provider-key-repository.js';
import { priceOverridesOf } from '../projects/price-overrides.js';
import { DEFAULT_REASONING_EFFORT, type ProjectSettings } from '../projects/project-settings.js';
import type { Project } from '../projects/project.js';
import { keyProviderOf } from '../providers/key-choice.js';
import type {
  ByScenario,
  EstimatePoint,
  EstimateRole,
  RoleEstimate,
  Scenario,
} from './estimate-types.js';
import type { TokenFigures } from './reader-estimate.js';

// RF-425, RF-613, ADR-007, DEC-107: the price of one role's tokens, shared by the estimate of an
// understand run and the estimate of a plan run. The model and provider are the role's in the
// project settings; the key source decides whether a project price override applies; costs are
// bigint micro-dollars like the ledger (DEC-54).

export interface RolePricing {
  /** Whether the user has an own key decides whether a project price override applies (DEC-107). */
  readonly keys: Pick<ProviderKeyRepository, 'find'>;
  /** The shipped price table (RF-420). */
  readonly priceTable: PriceTable;
  /** Q-58: the models the shipped list marks as reasoning models; none when left out. */
  readonly reasoningModels?: ReasoningModels;
}

export interface RoleTokens {
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
function costOfPoint(price: Price, tokens: TokenFigures, scenario: Scenario): bigint {
  const { inputTokens, outputTokens } = tokens;
  // Q-56: a model priced by prompt length is priced at the tier the prompt of one call reaches,
  // not the sum of all its calls: `costOf` takes the tier from the tokens of one call.
  const tiered = priceAt(price, tokens.promptTokens);
  const plain = costOf(tiered, { inputTokens, outputTokens, cachedInputTokens: 0 }).micros;
  const written = scenario === 'high' ? inputTokens : tokens.cacheWriteTokens;
  const withWrites = costOf(tiered, {
    ...{ inputTokens, outputTokens, cachedInputTokens: 0 },
    cacheWriteInputTokens: written,
  }).micros;
  return withWrites > plain ? withWrites : plain;
}

/** The user's own key when they hold one, else the server's; a local provider takes none. */
async function keySourceOf(
  keys: RolePricing['keys'],
  userId: string,
  kind: RoleEstimate['kind'],
): Promise<KeySource> {
  const keyProvider = keyProviderOf(kind);
  if (keyProvider === undefined) return 'none';
  return (await keys.find(userId, keyProvider)) === undefined ? 'server' : 'user';
}

/** Q-58: the effort the role asks for when its model is a reasoning model, else nothing. */
function effortOf(
  pricing: RolePricing,
  kind: RoleEstimate['kind'],
  setting: ProjectSettings['roles'][EstimateRole],
): { readonly reasoningEffort?: ReasoningEffort } {
  if (pricing.reasoningModels?.(kind, setting.model) !== true) return {};
  return { reasoningEffort: setting.reasoningEffort ?? DEFAULT_REASONING_EFFORT };
}

/** The role's setting, provider, key source and price lookup. */
interface PricedRole {
  readonly setting: ProjectSettings['roles'][EstimateRole];
  readonly name: string;
  readonly model: string;
  readonly config: ProjectSettings['providers'][string];
  readonly keySource: KeySource;
  readonly lookup: ReturnType<typeof lookupPrice>;
}

/** The role's provider, key source and price lookup, as the estimate and the first calls both need them. */
export async function priceOfRole(
  pricing: RolePricing,
  project: Project,
  role: EstimateRole,
): Promise<PricedRole> {
  const { settings } = project;
  const setting = settings.roles[role];
  const { provider: name, model } = setting;
  const config = Object.hasOwn(settings.providers, name) ? settings.providers[name] : undefined;
  if (config === undefined) throw new RosettaError(ERROR_CODES.settingsProviderUnknown);
  const keySource = await keySourceOf(pricing.keys, project.userId, config.kind);
  const lookup = lookupPrice(pricing.priceTable, priceOverridesOf(settings), {
    provider: config.kind,
    model,
    keySource,
  });
  return { setting, name, model, config, keySource, lookup };
}

// RF-425, RF-613, RF-420, RF-427, DEC-107
export async function estimateRole(
  pricing: RolePricing,
  project: Project,
  { role, tokens }: RoleTokens,
): Promise<RoleEstimate> {
  const { setting, name, model, config, keySource, lookup } = await priceOfRole(
    pricing,
    project,
    role,
  );
  const pointOf = (scenario: Scenario): EstimatePoint => {
    const { inputTokens, outputTokens } = tokens[scenario];
    const costMicros =
      lookup.kind === 'priced' ? costOfPoint(lookup.price, tokens[scenario], scenario) : 0n;
    return { inputTokens, outputTokens, costMicros };
  };
  return {
    ...{ role, provider: name, kind: config.kind, model, keySource },
    priced: lookup.kind === 'priced',
    ...effortOf(pricing, config.kind, setting),
    points: { low: pointOf('low'), likely: pointOf('likely'), high: pointOf('high') },
  };
}
