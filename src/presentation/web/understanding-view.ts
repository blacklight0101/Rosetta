import type { UnderstandingMeasures } from '../../domain/deepen/understanding-measures.js';
import type { Understanding } from '../../application/use-cases/read-understanding.js';

// RF-231: what the API shows of the understanding of a run. The files not read come largest first and
// at most `LISTED` are listed, with the count of all of them, so a large application does not make a
// large answer; the page links the coverage for the rest.

const LISTED = 10;

/** The page shows a file not read with its tokens and unread share; the line ranges stay out of the answer. */
type ListedFile = Omit<UnderstandingMeasures['filesNotRead'][number], 'unreadRanges'>;

export interface UnderstandingView {
  readonly measures:
    | (Omit<UnderstandingMeasures, 'filesNotRead'> & {
        readonly filesNotRead: readonly ListedFile[];
        readonly filesNotReadCount: number;
      })
    | null;
  readonly deepen: Understanding['deepen'];
}

function listed(file: UnderstandingMeasures['filesNotRead'][number]): ListedFile {
  const { path, tokens, unreadShare } = file;
  return unreadShare === undefined ? { path, tokens } : { path, tokens, unreadShare };
}

// RF-231
export function understandingView(understanding: Understanding): UnderstandingView {
  const { measures, deepen } = understanding;
  if (measures === null) return { measures: null, deepen };
  return {
    measures: {
      ...measures,
      filesNotRead: measures.filesNotRead.slice(0, LISTED).map(listed),
      filesNotReadCount: measures.filesNotRead.length,
    },
    deepen,
  };
}
