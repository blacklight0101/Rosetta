import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';

// RF-305, DEC-57, RNF-015, data-model.md section 3.19: `calibration.json`, the one file of a
// calibration run in `eval-out/<id>/`. It says what was judged (the set's version and hash, the
// prompt files with their SHA-256, the Rosetta version), and per model the agreement rate with the
// hand labels, the two kinds of error and every disagreement. The writer accepts only what parses here.

const count = z.number().int().min(0);
const text = z.string();
const label = z.enum(['Supported', 'Rejected']);

const disagreementSchema = z.strictObject({
  claimId: text.min(1),
  label,
  verdict: z.enum(['Supported', 'Rejected', 'Unverified']),
  reason: text,
});

const modelSchema = z.strictObject({
  provider: text.min(1),
  model: text.min(1),
  /** The exact version the provider reported; null when no answer named one. */
  modelVersion: text.nullable(),
  /** `CapReached` and `Stopped`: the claims not judged are `Unverified` and count as disagreements. */
  endState: z.enum(['Completed', 'CapReached', 'Stopped']),
  claims: count,
  agreed: count,
  agreementRate: z.number().min(0).max(1).nullable(),
  falseSupported: count,
  falseRejected: count,
  unjudged: count,
  disagreements: z.array(disagreementSchema),
});

const resultsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: text.min(1),
  at: z.iso.datetime(),
  rosettaVersion: text.min(1),
  calibrationSetVersion: text.min(1),
  calibrationSetSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  claims: count,
  promptVersions: z.record(
    text,
    z.strictObject({ version: text.min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/u) }),
  ),
  models: z.array(modelSchema).min(1),
});

export type CalibrationResults = z.infer<typeof resultsSchema>;
export type CalibrationModelResult = CalibrationResults['models'][number];

export interface CalibrationOutput {
  /** Writes `calibration.json` into a new folder named by the results' id; answers the folder. */
  write(results: CalibrationResults): Promise<string>;
}

// RF-305
export function parseCalibrationResults(data: unknown): Result<CalibrationResults, string[]> {
  const parsed = resultsSchema.safeParse(data);
  if (parsed.success) return ok(parsed.data);
  return err(
    parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join('.') || 'file'}: ${issue.message}`,
    ),
  );
}
