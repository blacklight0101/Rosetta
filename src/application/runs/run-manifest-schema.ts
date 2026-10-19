import { z } from 'zod';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import { RUN_END_STATES, RUN_STAGES } from '../../domain/runs/run-states.js';
import { planningBriefSchema } from '../planning/planning-brief-schema.js';
import { deepenRecordSchema } from './deepen-record-schema.js';

// Data-model.md section 3.6, DEC-43: `manifest.json` parsed at the boundary. A field added later
// without a version bump is ignored here; a newer `schemaVersion` is refused.

const count = z.number().int().min(0);
const text = z.string();
const nullableText = text.nullable();

const roleSchema = z.object({
  provider: text,
  kind: text,
  model: text,
  modelVersion: nullableText,
  modelDigest: nullableText,
  // Written from DEC-114 on; a role stored before that reads as unknown.
  contextTokens: count.nullable().default(null),
  contextSource: nullableText.default(null),
  toolMode: text,
  maxOutputTokens: count,
  temperature: z.number().nullable(),
  maxTurns: count.nullable(),
});

const roleCapsSchema = z.object({ maxCostMicros: count.nullable(), maxTokens: count.nullable() });

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  runId: text,
  stage: z.enum(RUN_STAGES),
  rosettaVersion: text,
  startedAt: nullableText,
  endedAt: nullableText,
  endState: z.enum(RUN_END_STATES).nullable(),
  resumedFrom: nullableText,
  source: z.object({
    url: text,
    owner: text,
    repo: text,
    ref: text,
    commitSha: nullableText,
    subpath: text,
    snapshotHash: nullableText,
  }),
  codemapHash: nullableText,
  options: z.record(z.string(), z.unknown()),
  roles: z.record(z.string(), roleSchema),
  promptVersions: z.record(z.string(), z.object({ version: text, sha256: text })),
  security: z.object({
    deniedReads: count,
    refusedRequests: count,
    skippedLinks: count,
    blockedCalls: count,
    allowDenied: z.array(text),
  }),
  priceTable: z.object({ version: text, currency: text }).nullable(),
  // Written from RF-606 on; a manifest stored before that reads as no catalogue.
  catalogue: z.object({ version: count, sha256: text }).nullable().default(null),
  // Written from RF-604 on; a manifest stored before that reads as no brief.
  brief: planningBriefSchema.nullable().default(null),
  // Written from RF-614 on; a manifest stored before that reads as no source run.
  sourceRunId: nullableText.default(null),
  // RF-209: written by a Deepen run only.
  deepen: deepenRecordSchema.optional(),
  caps: z.object({
    run: z.object({ maxCostMicros: count, maxTokens: count }),
    roles: z.record(z.string(), roleCapsSchema),
  }),
  masking: z.record(z.string(), count),
  totals: z.object({
    inputTokens: count,
    outputTokens: count,
    cachedInputTokens: count,
    costMicros: count,
    calls: count,
  }),
  agentTasks: z.array(
    z.object({
      agentTaskId: text,
      area: text,
      role: text,
      state: text,
      turns: count,
      cards: count,
    }),
  ),
});

/** The manifest the value describes, or undefined when it is not a version 1 manifest. */
// RF-003
export function parseRunManifest(value: unknown): RunManifest | undefined {
  const parsed = manifestSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
