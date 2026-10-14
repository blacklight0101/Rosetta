import type { PriceSettings, ProjectSettings, ProviderSettings } from '../api/project-schemas.js';
import { dollarsToMicros, microsToDollars, RUN_COST_MAX_MICROS } from '../lib/usd.js';
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
}

export interface SettingsDraft {
  readonly roles: Readonly<Record<RoleName, RoleDraft>>;
  /** Dollars. */
  readonly runCost: string;
  readonly runTokens: string;
  /** Dollars. */
  readonly confirmAbove: string;
  readonly allowUnpriced: boolean;
  readonly prices: readonly PriceDraft[];
  readonly maxFileBytes: string;
  readonly areaTokenBudget: string;
  readonly excerptMaxLines: string;
  readonly parallelism: string;
  readonly ignoreRules: string;
}

/** A field whose text is not a number; the path is the one the server uses for that field. */
export interface LocalProblem {
  readonly field: string;
  readonly message: string;
}

export type SettingsResult =
  | { readonly ok: true; readonly settings: ProjectSettings }
  | { readonly ok: false; readonly problems: readonly LocalProblem[] };

const dollarsOf = (micros: number): string => microsToDollars(String(micros));

function roleDraft(role: ProjectSettings['roles'][RoleName]): RoleDraft {
  return {
    provider: role.provider,
    model: role.model,
    maxOutputTokens: String(role.maxOutputTokens),
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
    runCost: dollarsOf(budget.run.maxCostMicros),
    runTokens: String(budget.run.maxTokens),
    confirmAbove: dollarsOf(budget.confirmAboveCostMicros),
    allowUnpriced: budget.allowUnpriced,
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
] as const;
const singleFields = [
  'roles.reader.maxTurns',
  'budget.run.maxCostMicros',
  'budget.run.maxTokens',
  'budget.confirmAboveCostMicros',
  'budget.allowUnpriced',
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
  for (const [index] of draft.prices.entries()) {
    for (const name of priceFields) fields.add(`budget.prices.${String(index)}.${name}`);
  }
  return fields;
}

const notWhole = 'Enter a whole number, for example 4096.';
const notDollars = 'Enter an amount in dollars, for example 2.50.';

/** Reads the fields one by one and remembers the ones that are not numbers. */
class FieldReader {
  readonly problems: LocalProblem[] = [];

  /** A whole number; zero (and a problem) when the text is not one. */
  whole(field: string, text: string): number {
    const trimmed = text.trim();
    const value = /^-?\d+$/u.test(trimmed) ? Number(trimmed) : Number.NaN;
    if (Number.isSafeInteger(value)) return value;
    this.problems.push({ field, message: notWhole });
    return 0;
  }

  /** A whole number or nothing: an empty field is left out of the document. */
  optionalWhole(field: string, text: string): number | undefined {
    return text.trim() === '' ? undefined : this.whole(field, text);
  }

  /** Dollars as micro-dollars; zero (and a problem) when the text is not an amount that fits. */
  micros(field: string, text: string, maxMicros?: bigint): number {
    const value = Number(dollarsToMicros(text, maxMicros) ?? Number.NaN);
    if (Number.isSafeInteger(value)) return value;
    this.problems.push({ field, message: notDollars });
    return 0;
  }
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
    maxOutputTokens: reader.whole(`${path}.maxOutputTokens`, draft.maxOutputTokens),
    maxTurns:
      name === 'reader' ? reader.optionalWhole(`${path}.maxTurns`, draft.maxTurns) : base.maxTurns,
  };
}

function pricesOf(drafts: readonly PriceDraft[], reader: FieldReader): PriceSettings[] {
  return drafts.map((draft, index) => {
    const path = `budget.prices.${String(index)}`;
    return {
      provider: draft.provider,
      model: draft.model,
      inputPerMillionMicros: reader.micros(`${path}.inputPerMillionMicros`, draft.input),
      outputPerMillionMicros: reader.micros(`${path}.outputPerMillionMicros`, draft.output),
      cachedInputPerMillionMicros: reader.micros(
        `${path}.cachedInputPerMillionMicros`,
        draft.cached,
      ),
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
export function settingsOf(base: ProjectSettings, draft: SettingsDraft): SettingsResult {
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
  if (reader.problems.length > 0) return { ok: false, problems: reader.problems };
  const providers = providersOf(base.providers, roles);
  return { ok: true, settings: { ...base, providers, roles, budget, scan, agents } };
}
