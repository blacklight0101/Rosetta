import type { Understanding } from '../../application/use-cases/read-understanding.js';

// RF-231: stub.

export function understandingView(understanding: Understanding): {
  readonly measures: {
    readonly filesNotRead: readonly { path: string; tokens: number }[];
    readonly filesNotReadCount: number;
  } | null;
  readonly deepen: Understanding['deepen'];
} {
  return { measures: null, deepen: understanding.deepen };
}
