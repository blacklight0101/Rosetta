import { breakMarkers } from '../egress/marker-skeleton.js';

// RF-605, RF-645, ADR-013, DEC-184: the typed answers of a brief that reach the planner and the
// package. Four questions take typed text (principles, architecture, migration, build method). A
// typed answer counts once its question has left `defaulted`; a brief saved before the typed answers
// reached the planner still lists the question there, so it keeps its older behaviour.

/** The questions that take a typed answer as text of their own. */
export const typedQuestionIds = ['principles', 'architecture', 'migration', 'buildMethod'] as const;
export type TypedQuestionId = (typeof typedQuestionIds)[number];

/** What a brief holds of typed answers. */
interface TypedSource {
  readonly defaulted: readonly string[];
  readonly typed?: Readonly<Record<string, string>> | undefined;
}

/** The typed text on one line: line breaks, control characters and runs of spaces become one space. */
export function typedText(text: string | undefined): string {
  // eslint-disable-next-line no-control-regex -- control characters are what this removes
  return (text ?? '').replace(/[\s\u0000-\u001f\u007f]+/gu, ' ').trim();
}

/** The questions whose typed answer reached the planner, each with its one-line text and its data-block markers broken. */
export function typedAnswers(brief: TypedSource): Partial<Record<TypedQuestionId, string>> {
  const found: Partial<Record<TypedQuestionId, string>> = {};
  for (const id of typedQuestionIds) {
    const text = typedText(brief.typed?.[id]);
    if (text !== '' && !brief.defaulted.includes(id)) found[id] = breakMarkers(text);
  }
  return found;
}

/**
 * DEC-184: what the package and the records call the enumerated default (the style, the strategy)
 * when the owner typed an own answer. The default is never the chosen one then; Rosetta keeps it
 * only as the reference its own checks compare with.
 */
export const checkReference = "the reference Rosetta's checks use";

/** The title of the default style or strategy, named as the check reference when an own answer exists. */
export function referenceTitle(brief: TypedSource, id: TypedQuestionId, title: string): string {
  return typedAnswers(brief)[id] === undefined ? title : `${title} (${checkReference})`;
}

/** Whether a save carries a typed text for the question (used to leave `defaulted`). */
export function hasTypedText(
  typed: Readonly<Record<string, string>> | undefined,
  id: TypedQuestionId,
): boolean {
  return typedText(typed?.[id]) !== '';
}
