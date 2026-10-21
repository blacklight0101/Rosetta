import { z } from 'zod';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import type { FieldProblem } from '../../domain/errors/field-problems.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { ProviderKind, ReasoningEffort } from '../ports/llm-provider.js';

// Data-model.md section 3.1, RF-002, RF-405, RF-010: the project settings document
// (`projects.settings`). Every field is required except the lists and values the table gives no
// default (price overrides, role caps, manual areas, temperature, maxTurns), so a stored document
// is always complete; the template supplies the defaults. Unknown keys are errors (a typo never
// changes behaviour). Each refusal carries an error code as the zod message and
// `parseProjectSettings` returns it with the dotted path of the field. A base URL is refused
// (DEC-112): it lives only with the user's key. Every numeric field has the allowed range of
// DEC-117 (data-model.md 3.1); a value outside it is RST-1006, except a cap below zero (RST-1003).

export const PROVIDER_KINDS = [
  'ollama',
  'openai',
  'openai-compatible',
  'anthropic',
  'fake',
] as const satisfies readonly ProviderKind[];
/** Q-58: the efforts a role may ask for; the ones every model that takes an effort accepts. */
const REASONING_EFFORTS = ['low', 'medium', 'high'] as const satisfies readonly ReasoningEffort[];
/** Q-58: the effort of a role that sets none. */
export const DEFAULT_REASONING_EFFORT = 'low' satisfies ReasoningEffort;
export const ROLE_NAMES = ['reader', 'verifier', 'planner', 'summariser'] as const;

const invalid = { error: ERROR_CODES.settingValueInvalid };
const negative = { error: ERROR_CODES.settingsCapNegative };
const missingModel = { error: ERROR_CODES.settingsModelMissing };
const unknownProvider = { error: ERROR_CODES.settingsProviderUnknown };

const MIN_CONTEXT_TOKENS = 1024;
const MAX_TEXT = 200;
const MAX_IGNORE_RULES = 100_000;
const MAX_LIST = 200;
const MAX_RUN_COST_MICROS = 100_000_000;
const MAX_RUN_TOKENS = 50_000_000;

/** A whole number from zero up: caps, prices, token and byte limits. */
const cap = z.number(invalid).int(invalid).min(0, negative);

/** A whole number within the allowed range of DEC-117. */
function ranged(low: number, high: number): z.ZodNumber {
  return z.number(invalid).int(invalid).min(low, invalid).max(high, invalid);
}
const flag = z.boolean(invalid);
const text = z.string(invalid).min(1, invalid).max(MAX_TEXT, invalid);
const textList = z.array(text, invalid).max(MAX_LIST, invalid);

const providerSchema = z
  .strictObject(
    {
      kind: z.enum(PROVIDER_KINDS, unknownProvider),
      keySource: z.enum(['user', 'user-then-server'], invalid),
      toolMode: z.enum(['native', 'text'], invalid),
      timeoutSeconds: ranged(10, 600),
      maxRetries: ranged(0, 5),
      contextTokens: z
        .union([z.literal('auto'), z.number().int().min(MIN_CONTEXT_TOKENS)], invalid)
        .optional(),
    },
    invalid,
  )
  .refine((provider) => provider.contextTokens === undefined || provider.kind === 'ollama', {
    error: ERROR_CODES.settingValueInvalid,
    path: ['contextTokens'],
  });

const roleFields = {
  provider: z.string(unknownProvider).min(1, unknownProvider),
  model: z.string(missingModel).trim().min(1, missingModel).max(MAX_TEXT, invalid),
  maxOutputTokens: ranged(256, 32_768),
  temperature: z.number(invalid).min(0, invalid).max(2, invalid).optional(),
  reasoningEffort: z.enum(REASONING_EFFORTS, invalid).optional(),
};

const readerSchema = z.strictObject(
  { ...roleFields, maxTurns: ranged(1, 50).optional() },
  missingModel,
);
const otherRoleSchema = z.strictObject(roleFields, missingModel);

const roleCapsSchema = z.strictObject(
  { maxCostMicros: cap.optional(), maxTokens: cap.optional() },
  invalid,
);

const priceSchema = z.strictObject(
  {
    provider: z.enum(PROVIDER_KINDS, unknownProvider),
    model: text,
    inputPerMillionMicros: cap,
    outputPerMillionMicros: cap,
    cachedInputPerMillionMicros: cap,
    cacheWriteInputPerMillionMicros: cap.optional(),
  },
  invalid,
);

const roleCapsByRole = z.strictObject(
  {
    reader: roleCapsSchema.optional(),
    verifier: roleCapsSchema.optional(),
    planner: roleCapsSchema.optional(),
    summariser: roleCapsSchema.optional(),
  },
  invalid,
);

const runCapsSchema = z.strictObject(
  {
    maxCostMicros: cap.max(MAX_RUN_COST_MICROS, invalid),
    maxTokens: cap.max(MAX_RUN_TOKENS, invalid),
  },
  invalid,
);

/** DEC-117: the threshold is at most the run cost cap; checked only when that cap is itself valid. */
function confirmWithinRunCap(budget: {
  readonly run: { readonly maxCostMicros: number };
  readonly confirmAboveCostMicros: number;
}): boolean {
  const runCap = budget.run.maxCostMicros;
  if (runCap < 0 || runCap > MAX_RUN_COST_MICROS) return true;
  return budget.confirmAboveCostMicros <= runCap;
}

const budgetSchema = z
  .strictObject(
    {
      run: runCapsSchema,
      roles: roleCapsByRole.optional(),
      confirmAboveCostMicros: cap,
      prices: z.array(priceSchema, invalid).max(MAX_LIST, invalid).optional(),
      allowUnpriced: flag,
    },
    invalid,
  )
  .refine(confirmWithinRunCap, {
    error: ERROR_CODES.settingValueInvalid,
    path: ['confirmAboveCostMicros'],
  });

const areaSchema = z.strictObject({ name: text, include: textList.min(1, invalid) }, invalid);

export const scanSettingsSchema = z.strictObject(
  {
    maxFileBytes: ranged(1_000, 5_000_000),
    areaTokenBudget: ranged(4_000, 200_000),
    areas: z.array(areaSchema, invalid).max(MAX_LIST, invalid).optional(),
    excerptMaxLines: ranged(20, 2_000),
    ignoreRules: z.string(invalid).max(MAX_IGNORE_RULES, invalid),
    allowDenied: textList,
  },
  invalid,
);

/** Names every object already has; a provider of that name would look defined when it is not. */
const RESERVED_NAMES: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));

const providerName = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/, invalid)
  .refine((name) => !RESERVED_NAMES.has(name), invalid);

const rolesSchema = z.strictObject(
  {
    reader: readerSchema,
    verifier: otherRoleSchema,
    planner: otherRoleSchema,
    summariser: otherRoleSchema,
  },
  invalid,
);

const settingsObject = z.strictObject(
  {
    schemaVersion: z.literal(1, invalid),
    providers: z.record(providerName, providerSchema, invalid),
    roles: rolesSchema,
    budget: budgetSchema,
    scan: scanSettingsSchema,
    agents: z.strictObject({ parallelism: ranged(1, 8) }, invalid),
    output: z.strictObject({ transcripts: flag }, invalid),
  },
  invalid,
);

export const projectSettingsSchema = settingsObject.superRefine((settings, context) => {
  for (const role of ROLE_NAMES) {
    if (Object.hasOwn(settings.providers, settings.roles[role].provider)) continue;
    context.addIssue({
      code: 'custom',
      message: ERROR_CODES.settingsProviderUnknown,
      path: ['roles', role, 'provider'],
    });
  }
});

export type ProjectSettings = z.output<typeof projectSettingsSchema>;

function codeOfMessage(message: string): ErrorCode {
  return (
    Object.values(ERROR_CODES).find((code) => code === message) ?? ERROR_CODES.settingValueInvalid
  );
}

function fieldOf(path: readonly PropertyKey[]): string {
  return path.map(String).join('.');
}

function problemsOf(issue: z.core.$ZodIssue): FieldProblem[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({
      field: fieldOf([...issue.path, key]),
      code:
        key === 'baseUrl' ? ERROR_CODES.settingsBaseUrlRefused : ERROR_CODES.settingValueInvalid,
    }));
  }
  return [{ field: fieldOf(issue.path), code: codeOfMessage(issue.message) }];
}

function byField(left: FieldProblem, right: FieldProblem): number {
  if (left.field === right.field) return 0;
  return left.field < right.field ? -1 : 1;
}

/** Zod's record skips an own __proto__ key, so a provider of that name is refused here. */
function reservedProviderProblems(input: unknown): FieldProblem[] {
  if (typeof input !== 'object' || input === null) return [];
  const providers: unknown = Reflect.get(input, 'providers');
  if (typeof providers !== 'object' || providers === null) return [];
  return Object.getOwnPropertyNames(providers)
    .filter((name) => RESERVED_NAMES.has(name))
    .map((name) => ({ field: `providers.${name}`, code: ERROR_CODES.settingValueInvalid }));
}

/**
 * Parses a settings document (RF-002). A refusal lists every problem with its field and code,
 * ordered by field and without duplicates; nothing is cast.
 */
// RF-002
export function parseProjectSettings(
  input: unknown,
): Result<ProjectSettings, readonly FieldProblem[]> {
  const reserved = reservedProviderProblems(input);
  const parsed = projectSettingsSchema.safeParse(input);
  if (parsed.success && reserved.length === 0) return ok(parsed.data);
  const problems = new Map<string, FieldProblem>();
  const issues = parsed.success ? [] : parsed.error.issues.flatMap(problemsOf);
  for (const problem of [...issues, ...reserved]) {
    problems.set(`${problem.field}|${problem.code}`, problem);
  }
  return err([...problems.values()].sort(byField));
}
