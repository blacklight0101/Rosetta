import type { UnderstandingMeasures } from '../../domain/deepen/understanding-measures.js';
import type { Understanding } from '../../application/use-cases/read-understanding.js';

// RF-231: what the API shows of the understanding of a run. The files not read come largest first and
// at most `LISTED` are listed, with the count of all of them, so a large application does not make a
// large answer; the page links the coverage for the rest.

const LISTED = 10;

export interface UnderstandingView {
  readonly measures: (UnderstandingMeasures & { readonly filesNotReadCount: number }) | null;
  readonly deepen: Understanding['deepen'];
}

// RF-231
export function understandingView(understanding: Understanding): UnderstandingView {
  const { measures, deepen } = understanding;
  if (measures === null) return { measures: null, deepen };
  return {
    measures: {
      ...measures,
      filesNotRead: measures.filesNotRead.slice(0, LISTED),
      filesNotReadCount: measures.filesNotRead.length,
    },
    deepen,
  };
}
