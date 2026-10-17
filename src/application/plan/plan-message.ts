import { formatCitation } from '../../domain/cards/citation.js';
import { renderDataBlock } from '../../domain/egress/data-block.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { RecordedQuestion } from '../ports/answers-file.js';

// RF-604, RF-145, ADR-013: what the planner is given. Two data blocks, each with its own fresh tag:
// the cards with only their `Supported` claims and the citations of each (never the code), and the
// owner's input, the planning brief with the rule of each chosen principle and the answered open
// questions. The cards were written about code by a model and the brief and answers were typed by
// people, so both blocks are data and the prompt says so; nothing of them is in the system prompt.

export interface PlanMessageInput {
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
  readonly catalogue: Catalogue;
  /** Only the questions with an answer. */
  readonly answered: readonly RecordedQuestion[];
}

function cardsText(cards: readonly SourceCard[]): string {
  const listed = cards.map(({ id, type, title, summary, claims }) => ({
    ...{ id, type, title, summary },
    claims: claims.map((claim) => ({
      text: claim.text,
      citations: claim.citations.map(formatCitation),
    })),
  }));
  return JSON.stringify(listed, null, 2);
}

function principlesOf(brief: PlanningBrief, catalogue: Catalogue): object[] {
  return brief.principles.flatMap((id) => {
    const entry = catalogue.entries.find((each) => each.id === id);
    return entry === undefined ? [] : [{ id, title: entry.title, rule: entry.rule }];
  });
}

function ownerText(input: PlanMessageInput): string {
  const { brief, catalogue } = input;
  return JSON.stringify(
    {
      planningBrief: {
        architectureStyle: brief.architecture.style,
        migration: brief.migration,
        stack: brief.stack.map(({ layer, choice }) => ({ layer, choice })),
        context: brief.context,
        aiAssistedBuild: brief.buildMethod.aiAssisted,
        principles: principlesOf(brief, catalogue),
      },
      answeredQuestions: input.answered.map(({ cardId, question, answer }) => ({
        ...{ cardId, question, answer },
      })),
    },
    null,
    2,
  );
}

/** The user message: the cards block, then the owner's block, each with a tag of its own. */
// RF-604, RF-145
export function planMessage(input: PlanMessageInput, tags: () => string): string {
  const cards = renderDataBlock(
    { source: 'cards', excerpts: [], text: cardsText(input.cards) },
    tags(),
  );
  const owner = renderDataBlock(
    { source: 'owner_answers', excerpts: [], text: ownerText(input) },
    tags(),
  );
  return `${cards}\n\n${owner}`;
}
