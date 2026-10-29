import type { BatchState } from '../../application/use-cases/workbook-batches.js';
import { toErrorReply } from './error-mapper.js';

// RF-159, RF-158: the state of a batch as the page reads it. A refusal after the request was accepted
// is the same body an error answer would have had (code, message, next step, the files), with the
// HTTP status it would have had, so the page shows it as it always did.

// RF-159
export function batchStateBody(state: BatchState): Record<string, unknown> {
  const { refusal, ...rest } = state;
  if (state.phase !== 'refused') return rest;
  const reply = toErrorReply(refusal);
  return { ...rest, refusal: { status: reply.status, ...reply.body } };
}
