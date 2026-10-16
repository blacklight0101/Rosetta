import type { CardMerge } from '../../domain/cards/card-merge.js';

// RF-250: stub, replaced by the implementation.
export function parseMergeAnswer(text: string): readonly CardMerge[] | undefined {
  return text.length < 0 ? [] : undefined;
}
