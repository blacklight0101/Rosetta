import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { AreaRead } from '../agent/agent-task-result.js';

// RF-206, RF-243: what an area's cards and coverage say about how it was read. A reader that read
// nothing has its cards kept with a note and its area marked "not read"; an area with no readable
// file says why; an area of third-party code has no application logic, so it writes no question.

const cardNoteNotRead = 'written without reading the area';

const coverageNotes = {
  notRead: 'not read',
  nothingReadable: 'no readable file in the area (only binary or ignored files)',
  noApplicationLogic: 'no application logic',
} as const;

/** The note of every card of an area (RF-206); undefined for an area that was read. */
// RF-206
export function cardNoteOf(areaRead: AreaRead | undefined): string | undefined {
  return areaRead === 'not-read' ? cardNoteNotRead : undefined;
}

/** The note of an area's coverage, the reasons joined; undefined when there is nothing to say. */
// RF-206, RF-243
export function coverageNoteOf(
  areaRead: AreaRead | undefined,
  thirdPartyOnly: boolean,
): string | undefined {
  const notes: string[] = [];
  if (areaRead === 'not-read') notes.push(coverageNotes.notRead);
  if (areaRead === 'nothing-readable') notes.push(coverageNotes.nothingReadable);
  if (thirdPartyOnly) notes.push(coverageNotes.noApplicationLogic);
  return notes.length === 0 ? undefined : notes.join('; ');
}

/** RF-243: an area of third-party code writes no open question; the others keep theirs. */
export function withoutQuestions(drafts: readonly CardDraft[]): readonly CardDraft[] {
  return drafts.filter((draft) => draft.type !== 'OQ');
}

// Words that say an area is third-party code: what a card of a library area is about when it only
// restates that. A card of own code in a library area is not expected, so the match is loose.
const LIBRARY_WORDS =
  /third[- ]?party|vendor(?:ed)?|librar(?:y|ies)|minified|\.min\.|bundle|generated|jquery|bootstrap|framework/iu;

/**
 * P3-123, RF-243: an area of third-party code writes no FEAT or BR card that only says it holds
 * third-party code. A FEAT or BR card whose title or summary names libraries is dropped; other
 * card types are kept.
 */
export function withoutLibraryDescriptions(drafts: readonly CardDraft[]): readonly CardDraft[] {
  return drafts.filter(
    (draft) =>
      (draft.type !== 'FEAT' && draft.type !== 'BR') ||
      !LIBRARY_WORDS.test(`${draft.title} ${draft.summary}`),
  );
}
