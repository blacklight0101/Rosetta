import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { MIN_REPETITIONS } from './run-evaluation.js';

// RNF-015, ADR-007: `eval/config.json`, the chosen models and the caps of `npm run eval`. Each role
// names a provider of the project settings and a model; the run cap applies to every repetition and
// the total cap to all of them together (the evaluation's account has it as its daily cap, so the
// budget guard stops the last run that would pass it). Command-line options may replace the roles
// and the repetitions; the caps are only read from the file.

const roleSchema = z.strictObject({
  provider: z.string().min(1).max(60),
  model: z.string().min(1).max(200),
});

const configSchema = z.strictObject({
  schemaVersion: z.literal(1),
  goldenSet: z.string().min(1).max(200),
  repetitions: z.number().int().min(MIN_REPETITIONS).max(20),
  roles: z.strictObject({
    reader: roleSchema.optional(),
    verifier: roleSchema.optional(),
    summariser: roleSchema.optional(),
  }),
  runCapMicros: z.number().int().min(1),
  totalCapMicros: z.number().int().min(1),
  parallelism: z.number().int().min(1).max(8).optional(),
});

export type EvaluationConfig = z.infer<typeof configSchema>;
export type EvaluationRoles = EvaluationConfig['roles'];

// RNF-015
export function parseEvaluationConfig(data: unknown): Result<EvaluationConfig, string> {
  const parsed = configSchema.safeParse(data);
  if (parsed.success) return ok(parsed.data);
  const problems = parsed.error.issues.map(
    (issue) => `${issue.path.map(String).join('.') || 'the settings'}: ${issue.message}`,
  );
  return err(problems.join('; '));
}
