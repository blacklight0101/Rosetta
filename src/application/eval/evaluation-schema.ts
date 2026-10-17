import { z } from 'zod';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RUN_END_STATES } from '../../domain/runs/run-states.js';

// RNF-015, RNF-006, RNF-012, data-model.md section 3.19: the two files of an evaluation in
// `eval-out/<id>/`. `experiment.json` says what was run (date, Rosetta version, golden set version
// and hash, repetitions, models with their exact versions and digests, prompt files with their
// SHA-256, settings); `results.json` holds the scores of each case on each repetition, the spread
// across repetitions and the targets of RFC-001 section 7. The runner writes only what parses here.

const count = z.number().int().min(0);
const share = z.number().min(0).max(1);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);
const text = z.string();

const roleSchema = z.strictObject({
  provider: text,
  kind: text,
  model: text,
  modelVersion: text.nullable(),
  modelDigest: text.nullable(),
  toolMode: text,
  maxOutputTokens: count,
  temperature: z.number().nullable(),
  maxTurns: count.nullable(),
});

const experimentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: text.min(1),
  at: z.iso.datetime(),
  rosettaVersion: text.min(1),
  goldenSetVersion: text.min(1),
  goldenSetSha256: sha256,
  repetitions: z.number().int().min(3),
  source: z.strictObject({ url: text, commit: z.string().regex(/^[0-9a-f]{40}$/u), subpath: text }),
  areas: z.array(text).min(1),
  roles: z.record(text, roleSchema),
  promptVersions: z.record(text, z.strictObject({ version: text.min(1), sha256 })),
  settings: z.record(text, z.union([z.number(), text, z.boolean(), z.null()])),
});

const ids = z.array(text).readonly();

const scoreShape = {
  supported: count,
  correct: count,
  incorrect: count,
  unmatched: count,
  precision: share.nullable(),
  strictPrecision: share.nullable(),
  rulesTotal: count,
  rulesFound: count,
  recall: share.nullable(),
  findingsTotal: count,
  findingsFound: count,
  recallAll: share.nullable(),
  foundFindings: ids,
  missedFindings: ids,
  absencesHit: ids,
  incorrectClaims: ids,
  unmatchedClaims: ids,
};

const spreadSchema = z
  .strictObject({
    n: count,
    min: z.number(),
    max: z.number(),
    mean: z.number(),
    stdDev: z.number(),
  })
  .nullable();

const estimateSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('measured'),
    likelyMicros: count,
    actualMicros: count,
    error: z.number(),
    withinTarget: z.boolean(),
  }),
  z.strictObject({
    status: z.literal('not-measured'),
    reason: z.enum(['unpriced', 'free', 'no-cost-report']),
    likelyMicros: count,
    actualMicros: count.nullable(),
  }),
]);

const repetitionSchema = z.strictObject({
  repetition: z.number().int().min(1),
  runId: text,
  endState: z.enum(RUN_END_STATES).nullable(),
  errorCode: text.nullable(),
  modelVersions: z.record(text, text.nullable()),
  costMicros: count.nullable(),
  supportedClaims: count,
  costPerSupportedClaimMicros: z.number().min(0).nullable(),
  overall: z.strictObject(scoreShape),
  citationValidity: z.strictObject({
    checked: count,
    valid: count,
    rate: share.nullable(),
    invalid: ids,
  }),
  estimate: estimateSchema,
  cases: z.array(z.strictObject({ caseId: text, ...scoreShape })),
});

const targetSchema = z.strictObject({
  target: z.number(),
  mean: z.number().nullable(),
  met: z.boolean().nullable(),
});

const resultsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  experimentId: text.min(1),
  goldenSetVersion: text.min(1),
  repetitions: z.array(repetitionSchema).min(3),
  summary: z.strictObject({
    precision: spreadSchema,
    strictPrecision: spreadSchema,
    recall: spreadSchema,
    recallAll: spreadSchema,
    citationValidity: spreadSchema,
    costMicros: spreadSchema,
    costPerSupportedClaimMicros: spreadSchema,
    estimateError: spreadSchema,
  }),
  cases: z.array(
    z.strictObject({
      caseId: text,
      precision: spreadSchema,
      recall: spreadSchema,
      recallAll: spreadSchema,
    }),
  ),
  targets: z.strictObject({
    precision: targetSchema,
    recall: targetSchema,
    citationValidity: targetSchema,
    estimate: z.strictObject({ target: z.number(), measured: count, within: count }),
  }),
});

export type Experiment = z.infer<typeof experimentSchema>;
export type ExperimentRole = z.infer<typeof roleSchema>;
export type Results = z.infer<typeof resultsSchema>;
export type RepetitionResult = z.infer<typeof repetitionSchema>;

function problemsOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);
}

// RNF-015
export function parseExperiment(data: unknown): Result<Experiment, readonly string[]> {
  const parsed = experimentSchema.safeParse(data);
  return parsed.success ? ok(parsed.data) : err(problemsOf(parsed.error));
}

// RNF-006, RNF-012, RNF-015
export function parseResults(data: unknown): Result<Results, readonly string[]> {
  const parsed = resultsSchema.safeParse(data);
  return parsed.success ? ok(parsed.data) : err(problemsOf(parsed.error));
}
