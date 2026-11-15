import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-1402, DEC-231: `lab/config.json`, the caps of the prompt lab in micro-dollars: the total of
// the phase, the stop line where the owner is asked before more is spent, and the most one
// invocation of the command may spend.

const micros = z.number().int().min(1);

const configSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    totalCapMicros: micros,
    stopMicros: micros,
    invocationCapMicros: micros,
  })
  .refine((config) => config.stopMicros <= config.totalCapMicros, {
    path: ['stopMicros'],
    message: 'stopMicros must not be above totalCapMicros',
  })
  .refine((config) => config.invocationCapMicros <= config.stopMicros, {
    path: ['invocationCapMicros'],
    message: 'invocationCapMicros must not be above stopMicros',
  });

export type LabConfig = z.infer<typeof configSchema>;

// RF-1402
export function parseLabConfig(data: unknown): Result<LabConfig, string> {
  const parsed = configSchema.safeParse(data);
  if (parsed.success) return ok(parsed.data);
  const problems = parsed.error.issues.map(
    (issue) => `${issue.path.map(String).join('.') || 'the settings'}: ${issue.message}`,
  );
  return err(problems.join('; '));
}
