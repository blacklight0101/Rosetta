import { z } from 'zod';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import type { FieldProblem } from '../../domain/errors/field-problems.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { PROVIDER_KINDS } from './project-settings.js';

// DEC-106, data-model.md section 4 (`server_settings`): the `defaultRoles` server setting, the
// provider and the dated model id the administrator chose for each role of a new project. A role
// left out keeps the template's model. The value is `{}` until the administrator sets it.
// `parseDefaultRoles` refuses a bad value with the field of each problem (`reader.provider`,
// `verifier.model`, an unknown role by its name) and its code, like the other settings.

const invalid = { error: ERROR_CODES.settingValueInvalid };
const MAX_MODEL = 200;

const roleChoice = z.strictObject(
  {
    provider: z.enum(PROVIDER_KINDS, { error: ERROR_CODES.settingsProviderUnknown }),
    model: z
      .string(invalid)
      .trim()
      .min(1, { error: ERROR_CODES.settingsModelMissing })
      .max(MAX_MODEL, invalid),
  },
  invalid,
);

export const defaultRolesSchema = z.strictObject(
  {
    reader: roleChoice.optional(),
    verifier: roleChoice.optional(),
    planner: roleChoice.optional(),
    summariser: roleChoice.optional(),
  },
  invalid,
);

export type DefaultRoles = z.output<typeof defaultRolesSchema>;

function codeOfMessage(message: string): ErrorCode {
  return (
    Object.values(ERROR_CODES).find((code) => code === message) ?? ERROR_CODES.settingValueInvalid
  );
}

function problemsOf(issue: z.core.$ZodIssue): FieldProblem[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => ({
      field: [...issue.path, key].map(String).join('.'),
      code: ERROR_CODES.settingValueInvalid,
    }));
  }
  return [{ field: issue.path.map(String).join('.'), code: codeOfMessage(issue.message) }];
}

function byField(left: FieldProblem, right: FieldProblem): number {
  if (left.field === right.field) return 0;
  return left.field < right.field ? -1 : 1;
}

/** Parses the roles of a request; a refusal lists every problem by field and code. */
// DEC-106
export function parseDefaultRoles(input: unknown): Result<DefaultRoles, readonly FieldProblem[]> {
  const parsed = defaultRolesSchema.safeParse(input);
  if (parsed.success) return ok(parsed.data);
  return err(parsed.error.issues.flatMap(problemsOf).toSorted(byField));
}
