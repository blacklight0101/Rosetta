import { z } from 'zod';
import { CLAIM_STATUSES } from '../../domain/cards/card-vocabulary.js';
import { DEEPEN_STOP_REASONS } from '../../domain/deepen/stop-rule.js';

// RF-209, RF-231, data-model.md section 3.6 (`deepen`): the Deepen record of a manifest, parsed at
// the boundary with the rest of the manifest.

const count = z.number().int().min(0);
const text = z.string();
const share = z.number().min(0).max(1).nullable();

const measureSchema = z.object({
  firstPartyCoverage: share,
  firstPartyTokens: count,
  firstPartyReadTokens: count,
  filesNotRead: count,
  supported: count,
  rejected: count,
  supportedShare: share,
  notJudged: count,
  rejectedUnresolved: count,
  supportedAfterReread: count,
  thirdParty: z.object({ files: count, tokens: count, claims: count }),
  wellCovered: z.boolean(),
});

const roundSchema = z.object({
  round: count,
  complete: z.boolean(),
  judged: z.array(text),
  reread: z.array(z.object({ claimId: text, reason: text })),
  filesRead: z.array(text),
  newClaims: z.array(
    z.object({ claimId: text, status: z.enum(CLAIM_STATUSES), replaces: text.optional() }),
  ),
  tokens: count,
  costMicros: count,
});

export const deepenRecordSchema = z.object({
  parentRunId: text,
  parentRunKey: text,
  maxRounds: count,
  coveragePass: z.boolean(),
  roundsDone: count,
  stopReason: z.enum(DEEPEN_STOP_REASONS).nullable(),
  outOfScope: z.array(z.object({ claimId: text, reason: text })),
  rounds: z.array(roundSchema),
  before: measureSchema.nullable(),
  after: measureSchema.nullable(),
});
