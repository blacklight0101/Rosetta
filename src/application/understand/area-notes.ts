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

// P3-123: a card that only says what the area is: its title starts with the word (`Third-party
// libraries`, `Vendored jQuery`), or its summary starts by saying the area holds such code (`The
// area holds only third-party code.`). A rule of the application that mentions a library
// (`jQuery validation requires a non-empty field`, `vendor payment terms`) is kept.
const LIBRARY_TITLE = /^(?:the\s+)?(?:third[- ]?party|vendored|minified|generated|bundled)\b/iu;
const LIBRARY_SUMMARY =
  /^(?:the\s+)?[\w.\- ]{0,30}\b(?:holds|contains|consists of|is made up of|is|are)\s+(?:only\s+)?(?:a\s+)?(?:third[- ]?party|vendored|minified|generated)\b/iu;

/**
 * P3-123, RF-243: an area of third-party code writes no FEAT or BR card that only says it holds
 * third-party code. Other cards, and the other card types, are kept.
 */
export function withoutLibraryDescriptions(drafts: readonly CardDraft[]): readonly CardDraft[] {
  return drafts.filter(
    (draft) =>
      (draft.type !== 'FEAT' && draft.type !== 'BR') ||
      !(LIBRARY_TITLE.test(draft.title.trim()) || LIBRARY_SUMMARY.test(draft.summary.trim())),
  );
}
