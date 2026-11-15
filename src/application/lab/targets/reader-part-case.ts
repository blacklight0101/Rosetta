import { z } from 'zod';
import { renderDataBlock } from '../../../domain/egress/data-block.js';
import { readerCaseSchema } from './reader-case.js';

// RF-1406, ADR-029: the case of the other reader prompts. It is a reader case (the area's file
// list, the turns, the reads) with the one part its prompt adds: the owner's answers, the rejected
// claims or the parent's cards as the text of their data block, or the facts of a read-more
// refusal. Nothing a model wrote in a turn is in a case.

export const readerPartCaseSchema = readerCaseSchema.extend({
  /** The text of the `owner_answers` block of a re-run with answers (RF-241). */
  answers: z.string().min(1).max(8000).optional(),
  /** The text of the `cards` block of rejected claims a Deepen re-reads (RF-209). */
  rejected: z.string().min(1).max(12_000).optional(),
  /** The text of the `cards` block of the parent's cards a Deepen task adds to (DEC-158). */
  parentCards: z.string().min(1).max(8000).optional(),
  /** What the refusal of an answer after a short read says (Q-50). */
  readMore: z
    .strictObject({
      percent: z.number().int().min(0).max(100),
      readTokens: z.number().int().min(0),
      tokens: z.number().int().min(1),
      unread: z.array(z.string().min(1).max(400)).min(1).max(20),
    })
    .optional(),
});

export type ReaderPartCase = z.infer<typeof readerPartCaseSchema>;

/** A block the run's tool would render for the text, under the tag it is given. */
export const blockOf = (
  source: 'owner_answers' | 'cards' | 'list_area_files',
  text: string,
  tag: string,
): string => renderDataBlock({ source, excerpts: [], text }, tag);
