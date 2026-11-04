import { z } from 'zod';

// P8-111, DEC-217, data-model.md section 4 (`runs.end_reason`): why a run that ended `Interrupted`
// ended. A reason the page does not know reads as none (the wording of a run with no reason).

const endReasonSchema = z.enum(['UserStop', 'Restart', 'QueueCancel']);

export type EndReason = z.output<typeof endReasonSchema>;

/** The reason on the wire; a value the page does not know reads as null, a missing field as absent. */
export const endReasonField = endReasonSchema.nullable().catch(null).optional();
