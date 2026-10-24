import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { RunEventPublisher } from '../runs/run-event-publisher.js';
import type { ScannedSource } from '../ports/scan-results.js';
import { withoutBookkeeping } from './bookkeeping-claims.js';
import { withPageMarkup } from './with-page-markup.js';

// P3-110, EV-26, P5-31: what a reader task's drafts go through before the cards are made: claims
// that only restate card ids or cite a non-file never reach the check, and the screen cards get the
// markup of the pages they cite so each claim cites its own element.

/** The outcome of a reader task, ready for its cards. */
export function finishedDrafts<T extends { readonly drafts: readonly CardDraft[] }>(
  parts: {
    readonly execution: { readonly events: Pick<RunEventPublisher, 'emit'> };
    readonly scanned: Pick<ScannedSource, 'reader' | 'pageMarkup'> & {
      readonly codeMap: Pick<CodeMap, 'files'>;
    };
  },
  agentTaskId: string,
  outcome: T,
): Promise<T> {
  const where = { agentTaskId, codeMap: parts.scanned.codeMap };
  return withoutBookkeeping(parts.execution.events, where, outcome).then((bare) =>
    withPageMarkup(parts.scanned, bare),
  );
}
