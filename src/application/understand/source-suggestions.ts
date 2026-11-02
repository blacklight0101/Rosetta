import type { CardDraft } from '../../domain/cards/card-ids.js';
import {
  suggestionFromCitedLines,
  type CitedLine,
} from '../../domain/cards/open-question-answered-kinds.js';
import type { SuggestedAnswer } from '../../domain/cards/suggested-answer.js';
import { cardLimits } from '../cards/card-limits.js';
import type { RepositoryReader } from '../ports/repository-reader.js';

// RF-243, P8-08, EV-09: an open question for the connection string, the publish parameters or the
// upload's own source is never dropped; when a cited line holds a plain literal for it, that line is
// offered first as the recommended suggested answer, with file:line, and the owner confirms it.

async function suggestionOf(
  reader: Pick<RepositoryReader, 'readLines'>,
  draft: CardDraft,
): Promise<SuggestedAnswer | undefined> {
  const { question } = draft;
  if (draft.type !== 'OQ' || question === undefined) return undefined;
  const cited: CitedLine[] = [];
  for (const { citations } of draft.claims) {
    for (const { path, startLine, endLine } of citations) {
      const read = await reader.readLines({ path, startLine, endLine }).catch(() => undefined);
      if (read?.ok !== true) continue;
      read.value.lines.forEach((text, index) => {
        cited.push({ path, line: startLine + index, text });
      });
    }
  }
  const found = suggestionFromCitedLines(question, cited);
  if (found === undefined) return undefined;
  const at = { path: found.path, startLine: found.line, endLine: found.line };
  return {
    ...{ answer: found.answer, description: found.description },
    ...{ recommended: true, citations: [at] },
  };
}

/** The drafts with the suggestion of the cited lines first (recommended) on the questions that have one. */
// RF-243
export async function withSourceSuggestions<T extends { readonly drafts: readonly CardDraft[] }>(
  reader: Pick<RepositoryReader, 'readLines'>,
  outcome: T,
  onCut?: (question: string) => Promise<void>,
): Promise<T> {
  const drafts: CardDraft[] = [];
  for (const draft of outcome.drafts) {
    const suggestion = await suggestionOf(reader, draft);
    if (suggestion === undefined) {
      drafts.push(draft);
      continue;
    }
    const others = (draft.suggestedAnswers ?? []).map((each) => ({ ...each, recommended: false }));
    const kept = others.slice(0, cardLimits.maxSuggestedAnswers - 1);
    if (others.length > kept.length) await onCut?.(draft.question ?? draft.title);
    drafts.push({ ...draft, suggestedAnswers: [suggestion, ...kept] });
  }
  return { ...outcome, drafts };
}
