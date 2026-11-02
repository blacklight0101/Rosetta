import type { PriceSettings, ProjectSettings, ProviderSettings } from '../api/project-schemas.js';
import { microsToDollars, RUN_COST_MAX_MICROS } from '../lib/usd.js';
import { FieldReader, type LocalProblem } from './field-reader.js';
import {
  contextDraftOf,
  contextPath,
  parseContextSize,
  usesOllama,
  withContextSize,
  type ContextLimit,
} from './ollama-context.js';
import { providerDefaults } from './provider-choices.js';

// RF-002, RF-405, DEC-116, DEC-117: the settings form as text. `draftOf` turns the stored document
// into what the fields show (caps in dollars, every other number as it is stored) and `settingsOf`
// turns the fields back into a whole document for the save, which replaces the stored one. The
// page judges nothing about ranges: a negative cap or a value outside DEC-117 goes to the server,
// which answers with the field and the code. Only text that is not a number at all is named here.

export const ROLE_NAMES = ['reader', 'verifier', 'planner', 'summariser'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export interface RoleDraft {
  readonly provider: string;
  readonly model: string;
  /** Empty when the project sets no limit: the role takes the default of its model (Q-57). */
  readonly maxOutputTokens: string;
  /** The reader only; empty for the others and for a reader without a limit. */
  readonly maxTurns: string;
}

export interface PriceDraft {
  readonly provider: string;
  readonly model: string;
  /** Dollars per million tokens. */
  readonly input: string;
  readonly output: string;
  readonly cached: string;
  /** Empty when the override has no cache-write price (P2-16). */
  readonly cacheWrite: string;
}

export interface SettingsDraft {
  readonly roles: Readonly<Record<RoleName, RoleDraft>>;
  /** The Ollama context size (RF-401): `auto` or the digits of a number of tokens. */
  readonly ollamaContext: string;
  /** Dollars. */
  readonly runCost: string;
  readonly runTokens: string;
  /** Dollars. */
  readonly confirmAbove: string;
  readonly allowUnpriced: boolean;
  /** RF-433: off when the project never set it. */
  readonly noCapForLocalModels: boolean;
  readonly prices: readonly PriceDraft[];
  readonly maxFileBytes: string;
  readonly areaTokenBudget: string;
  readonly excerptMaxLines: string;
  readonly parallelism: string;
  readonly ignoreRules: string;
}

export type { LocalProblem } from './field-reader.js';

export type SettingsResult =
  | { readonly ok: true; readonly settings: ProjectSettings }
  | { readonly ok: false; readonly problems: readonly LocalProblem[] };

const dollarsOf = (micros: number): string => microsToDollars(String(micros));

function roleDraft(role: ProjectSettings['roles'][RoleName]): RoleDraft {
  return {
    provider: role.provider,
    model: role.model,
    maxOutputTokens: role.maxOutputTokens === undefined ? '' : String(role.maxOutputTokens),
    maxTurns: role.maxTurns === undefined ? '' : String(role.maxTurns),
  };
}

function priceDraft(price: PriceSettings): PriceDraft {
  return {
    provider: price.provider,
    model: price.model,
    input: dollarsOf(price.inputPerMillionMicros),
    output: dollarsOf(price.outputPerMillionMicros),
    cached: dollarsOf(price.cachedInputPerMillionMicros),
    cacheWrite:
      price.cacheWriteInputPerMillionMicros === undefined
        ? ''
        : dollarsOf(price.cacheWriteInputPerMillionMicros),
  };
}

// RF-002
export function draftOf(settings: ProjectSettings): SettingsDraft {
  const { budget, scan } = settings;
  return {
    roles: {
      reader: roleDraft(settings.roles.reader),
      verifier: roleDraft(settings.roles.verifier),
      planner: roleDraft(settings.roles.planner),
      summariser: roleDraft(settings.roles.summariser),
    },
    ollamaContext: contextDraftOf(settings.providers['ollama']?.contextTokens),
    runCost: dollarsOf(budget.run.maxCostMicros),
    runTokens: String(budget.run.maxTokens),
    confirmAbove: dollarsOf(budget.confirmAboveCostMicros),
    allowUnpriced: budget.allowUnpriced,
    noCapForLocalModels: budget.noCapForLocalModels === true,
    prices: (budget.prices ?? []).map(priceDraft),
    maxFileBytes: String(scan.maxFileBytes),
    areaTokenBudget: String(scan.areaTokenBudget),
    excerptMaxLines: String(scan.excerptMaxLines),
    parallelism: String(settings.agents.parallelism),
    ignoreRules: scan.ignoreRules,
  };
}

const roleFields = ['provider', 'model', 'maxOutputTokens'] as const;
const priceFields = [
  'provider',
  'model',
  'inputPerMillionMicros',
  'outputPerMillionMicros',
  'cachedInputPerMillionMicros',
  'cacheWriteInputPerMillionMicros',
] as const;
const singleFields = [
  'roles.reader.maxTurns',
  'budget.run.maxCostMicros',
  'budget.run.maxTokens',
  'budget.confirmAboveCostMicros',
  'budget.allowUnpriced',
  'budget.noCapForLocalModels',
  'scan.maxFileBytes',
  'scan.areaTokenBudget',
  'scan.excerptMaxLines',
  'scan.ignoreRules',
  'agents.parallelism',
] as const;

/** The paths of the settings the form shows a field for; a refusal of any other path has no field. */
export function shownFields(draft: SettingsDraft): ReadonlySet<string> {
  const fields = new Set<string>(singleFields);
  for (const role of ROLE_NAMES) {
    for (const name of roleFields) fields.add(`roles.${role}.${name}`);
  }
  if (usesOllama(draft.roles)) fields.add(contextPath);
  for (const [index] of draft.prices.entries()) {
    for (const name of priceFields) fields.add(`budget.prices.${String(index)}.${name}`);
  }
  return fields;
}

type RoleSettings = ProjectSettings['roles'][RoleName];

function roleOf(
  base: RoleSettings,
  name: RoleName,
  draft: RoleDraft,
  reader: FieldReader,
): RoleSettings {
  const path = `roles.${name}`;
  return {
    ...base,
    provider: draft.provider,
    model: draft.model,
    // Q-57: an empty field leaves the limit out of the document, so the role keeps the default of its model.
    maxOutputTokens: reader.optionalWhole(`${path}.maxOutputTokens`, draft.maxOutputTokens),
    maxTurns:
      name === 'reader' ? reader.optionalWhole(`${path}.maxTurns`, draft.maxTurns) : base.maxTurns,
  };
}

function pricesOf(drafts: readonly PriceDraft[], reader: FieldReader): PriceSettings[] {
  return drafts.map((draft, index) => {
    const path = `budget.prices.${String(index)}`;
    // P2-16: an empty cache-write field leaves the price out; it is never sent as a zero.
    const cacheWrite =
      draft.cacheWrite.trim() === ''
        ? {}
        : {
            cacheWriteInputPerMillionMicros: reader.micros(
              `${path}.cacheWriteInputPerMillionMicros`,
              draft.cacheWrite,
            ),
          };
    return {
      provider: draft.provider,
      model: draft.model,
      inputPerMillionMicros: reader.micros(`${path}.inputPerMillionMicros`, draft.input),
      outputPerMillionMicros: reader.micros(`${path}.outputPerMillionMicros`, draft.output),
      cachedInputPerMillionMicros: reader.micros(
        `${path}.cachedInputPerMillionMicros`,
        draft.cached,
      ),
      ...cacheWrite,
    };
  });
}

function budgetOf(
  base: ProjectSettings['budget'],
  draft: SettingsDraft,
  reader: FieldReader,
): ProjectSettings['budget'] {
  const prices = pricesOf(draft.prices, reader);
  return {
    ...base,
    run: {
      ...base.run,
      maxCostMicros: reader.micros('budget.run.maxCostMicros', draft.runCost, RUN_COST_MAX_MICROS),
      maxTokens: reader.whole('budget.run.maxTokens', draft.runTokens),
    },
    confirmAboveCostMicros: reader.micros(
      'budget.confirmAboveCostMicros',
      draft.confirmAbove,
      RUN_COST_MAX_MICROS,
    ),
    allowUnpriced: draft.allowUnpriced,
    // RF-433: left out when off, so a project that never set it keeps its document as it was.
    noCapForLocalModels: draft.noCapForLocalModels ? true : undefined,
    prices: prices.length === 0 ? undefined : prices,
  };
}

/** The project's providers plus a default entry for each provider a role now names. */
function providersOf(
  base: ProjectSettings['providers'],
  roles: ProjectSettings['roles'],
): ProjectSettings['providers'] {
  const added: Record<string, ProviderSettings> = {};
  for (const name of ROLE_NAMES) {
    const provider = roles[name].provider;
    const entry = providerDefaults[provider];
    if (!Object.hasOwn(base, provider) && entry !== undefined) added[provider] = entry;
  }
  return { ...base, ...added };
}

// RF-002
export function settingsOf(
  base: ProjectSettings,
  draft: SettingsDraft,
  limit?: ContextLimit,
): SettingsResult {
  const reader = new FieldReader();
  const roles = {
    ...base.roles,
    reader: roleOf(base.roles.reader, 'reader', draft.roles.reader, reader),
    verifier: roleOf(base.roles.verifier, 'verifier', draft.roles.verifier, reader),
    planner: roleOf(base.roles.planner, 'planner', draft.roles.planner, reader),
    summariser: roleOf(base.roles.summariser, 'summariser', draft.roles.summariser, reader),
  };
  const budget = budgetOf(base.budget, draft, reader);
  const scan = {
    ...base.scan,
    maxFileBytes: reader.whole('scan.maxFileBytes', draft.maxFileBytes),
    areaTokenBudget: reader.whole('scan.areaTokenBudget', draft.areaTokenBudget),
    excerptMaxLines: reader.whole('scan.excerptMaxLines', draft.excerptMaxLines),
    ignoreRules: draft.ignoreRules,
  };
  const agents = {
    ...base.agents,
    parallelism: reader.whole('agents.parallelism', draft.parallelism),
  };
  const size = usesOllama(draft.roles) ? parseContextSize(draft.ollamaContext, limit) : undefined;
  if (size?.ok === false) reader.problems.push({ field: contextPath, message: size.message });
  if (reader.problems.length > 0) return { ok: false, problems: reader.problems };
  const added = providersOf(base.providers, roles);
  const providers = size?.ok === true ? withContextSize(added, size.value) : added;
  return { ok: true, settings: { ...base, providers, roles, budget, scan, agents } };
}
