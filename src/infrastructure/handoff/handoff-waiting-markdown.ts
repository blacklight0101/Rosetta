import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { waitingOnQuestions, type WaitingResult } from '../../domain/planning/question-cards.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { handoffFiles, idLink } from './handoff-links.js';

// RF-637, DEC-135: the cards each open question blocks. The open-questions file gives every
// question its default and the cards waiting on it (or `none`), and the roadmap marks those cards
// as waiting until the question is answered or its default is accepted. The ids are made by code
// (card, question and phase ids); only the question text is escaped.

/** The cards that wait on each question of the package and the questions each card waits on. */
export function waitingOf(handoff: HandoffPackage): WaitingResult {
  const { requirements, tasks } = handoff.content;
  return waitingOnQuestions({
    questions: [
      ...handoff.briefQuestions.map(({ id }) => ({ id })),
      ...handoff.prdQuestions.map(({ id }) => ({ id })),
      ...handoff.openQuestions.map(({ cardId, area }) => ({ id: cardId, area })),
    ],
    tasks,
    requirements,
    areas: new Map(handoff.sources.map((card) => [card.id, card.area])),
  });
}

/** The cards waiting on a question as links, or `none`. */
export function waitingCards(waiting: WaitingResult, questionId: string): string {
  const cards = waiting.byQuestion.get(questionId) ?? [];
  return cards.length === 0 ? 'none' : cards.map((id) => idLink(id, handoffFiles.tasks)).join(', ');
}

/** The cards of a phase that wait on a question, each with the questions it waits on. */
// RF-637
export function waitingLines(
  waiting: WaitingResult,
  cards: readonly { readonly id: string }[],
  esc: MarkdownEscaper,
): string[] {
  const lines = cards.flatMap(({ id }) => {
    const questions = waiting.byCard.get(id) ?? [];
    return questions.length === 0
      ? []
      : [
          `- ${idLink(id, handoffFiles.tasks)}: ${questions.map((each) => esc.inline(each)).join(', ')}`,
        ];
  });
  return lines.length === 0 ? [] : ['Waiting on open questions:', '', ...lines, ''];
}

/** What the marks in the roadmap mean (RF-637). */
export const waitingNote = `A card marked as waiting is held by an open question listed in [open questions](${handoffFiles.openQuestions}) until the question is answered or its default is accepted.`;
