import { z } from 'zod';

// RF-615, journey-routes.ts: the wire shape of `GET /api/projects/:id/journey`, the facts the journey
// strip is drawn from. Every answer is parsed before use. Instants are ISO text; a cost is micro-dollars.

const count = z.number().int().nonnegative();

const journeyRun = z.object({
  id: z.string(),
  /** The folder name of the run. */
  runKey: z.string(),
  queueState: z.enum(['Queued', 'Running', 'Ended']),
  endState: z.string().nullable(),
  endedAt: z.string().nullable(),
  costMicros: count,
  /** The `RST` code the run ended with, if any. */
  errorCode: z.string().nullable(),
  /** P7-02: the planned areas no reader started. */
  unreadAreas: count.optional(),
});

export const journeySchema = z.object({
  /** The understand run the package is written from; null while the project has none. */
  source: journeyRun
    .extend({
      supportedClaims: count,
      openQuestions: count,
      /** RF-646: the Deepens linked to the run's first understand run. */
      deepens: count.default(0),
      isDeepen: z.boolean().default(false),
      /** P6-33: a Deepen of the run is queued or running. */
      deepening: z.boolean().default(false),
    })
    .nullable(),
  scanRunId: z.string().nullable(),
  briefSaved: z.boolean(),
  /** The newest plan run written from the source run. */
  plan: journeyRun.nullable(),
  handoff: z
    .object({ runId: z.string(), runKey: z.string(), outOfDate: z.boolean(), gaps: z.boolean() })
    .nullable(),
});

export type JourneyFacts = z.output<typeof journeySchema>;
export type JourneySourceFacts = NonNullable<JourneyFacts['source']>;
export type JourneyRunFacts = z.output<typeof journeyRun>;
