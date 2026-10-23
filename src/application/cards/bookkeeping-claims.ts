import type { CardDraft, TaskCards } from '../../domain/cards/card-ids.js';
import { CARD_TYPES } from '../../domain/cards/card-vocabulary.js';
import type { ClaimInput } from '../../domain/cards/card.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { RunEventPublisher } from '../runs/run-event-publisher.js';

// P3-110, RF-230, RF-300, EV-26: the Deepen reader is shown the cards that exist as a data block, and a
// small model writes claims about that list ("also listed with ID ENT-004") and cites the block's tag
// as if it were a file. Such a claim is bookkeeping, not evidence about the code. It is dropped before
// the citation check and judgement are paid for, and the task's event counts it. Two things mark it:
// the text names a card id and no citation is a file of the code map, or every citation is a token
// that cannot be a file name (no separator, no extension). A claim whose path is only wrong, such as a
// file name without its folder, is not touched: the citation check marks it (RF-300, RF-302).

const CARD_ID = new RegExp(String.raw`\b(?:${CARD_TYPES.join('|')})-\d{3,}\b`);

function isFileName(path: string): boolean {
  return path.includes('.') || path.includes('/') || path.includes('\\');
}

function isBookkeeping(claim: ClaimInput, files: ReadonlySet<string>): boolean {
  const { text, citations } = claim;
  if (citations.length === 0) return false;
  if (citations.every((citation) => !isFileName(citation.path))) return true;
  const cited = citations.some((citation) => files.has(citation.path));
  return !cited && CARD_ID.test(text);
}

/** The task without its bookkeeping claims (and the cards left with none), and how many claims went. */
// RF-230, RF-300
export function withoutBookkeepingClaims(
  task: TaskCards,
  files: ReadonlySet<string>,
): { readonly task: TaskCards; readonly dropped: number } {
  let dropped = 0;
  const drafts = task.drafts.flatMap((draft): CardDraft[] => {
    const claims = draft.claims.filter((claim) => !isBookkeeping(claim, files));
    dropped += draft.claims.length - claims.length;
    return claims.length === 0 ? [] : [{ ...draft, claims }];
  });
  return { task: dropped === 0 ? task : { ...task, drafts }, dropped };
}

/** The files a code map lists, to tell a file from a token. */
function filePathsOf(codeMap: Pick<CodeMap, 'files'>): ReadonlySet<string> {
  return new Set(codeMap.files.map((file) => file.path));
}

/**
 * The outcome of a reader task without its bookkeeping claims; the count is published as
 * `agent.claims.dropped` under the task, so the run log shows what the readers wrote and what was kept.
 */
// RF-230, RF-1002
export async function withoutBookkeeping<T extends { readonly drafts: readonly CardDraft[] }>(
  events: Pick<RunEventPublisher, 'emit'>,
  where: { readonly agentTaskId: string; readonly codeMap: Pick<CodeMap, 'files'> },
  outcome: T,
): Promise<T> {
  const { agentTaskId, codeMap } = where;
  const kept = withoutBookkeepingClaims(
    { agentTaskId, area: '', drafts: outcome.drafts },
    filePathsOf(codeMap),
  );
  if (kept.dropped === 0) return outcome;
  await events.emit(
    'agent.claims.dropped',
    { count: kept.dropped, reason: 'bookkeeping' },
    agentTaskId,
  );
  return { ...outcome, drafts: kept.task.drafts };
}
