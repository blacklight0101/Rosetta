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

/**
 * The typed text on one line: line breaks, C0 and C1 control characters, the bidi overrides and
 * isolates (U+202A..U+202E, U+2066..U+2069, which could make the text display other than it reads)
 * and runs of spaces become one space (ADR-013).
 */
export function typedText(text: string | undefined): string {
  return (text ?? '')
    .replace(
      // eslint-disable-next-line no-control-regex -- control characters are what this removes
      /[\s\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]+/gu,
      ' ',
    )
    .trim();
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
 * DEC-184: the one check of Rosetta that uses the enumerated default when the owner typed an own
 * answer. The default is never the chosen one then; Rosetta keeps it only as the reference that
 * check compares with: the dependency check for the style, the strategy-fit check for the strategy.
 */
export const referenceChecks = {
  style: "Rosetta's dependency check",
  strategy: "Rosetta's strategy-fit check",
} as const;
export type ReferenceKind = keyof typeof referenceChecks;

/** "the reference Rosetta's dependency check uses" (or its strategy-fit check). */
export function checkReference(kind: ReferenceKind): string {
  return `the reference ${referenceChecks[kind]} uses`;
}

/** The title of the default style or strategy, named as the default and its check's reference when an own answer exists. */
export function referenceTitle(brief: TypedSource, id: TypedQuestionId, title: string): string {
  if (typedAnswers(brief)[id] === undefined) return title;
  const kind: ReferenceKind = id === 'migration' ? 'strategy' : 'style';
  return `${title} (the default ${kind}, ${checkReference(kind)})`;
}

/** Whether a save carries a typed text for the question (used to leave `defaulted`). */
export function hasTypedText(
  typed: Readonly<Record<string, string>> | undefined,
  id: TypedQuestionId,
): boolean {
  return typedText(typed?.[id]) !== '';
}
