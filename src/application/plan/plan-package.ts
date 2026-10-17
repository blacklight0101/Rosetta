import { defaultedQuestions } from '../../domain/planning/brief-questions.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PlanContent } from '../../domain/planning/plan-content.js';
import { excludedClaims, supportedCards } from '../../domain/planning/plan-sources.js';
import type { HandoffPackage, PackagePrinciple } from './handoff-package.js';
import type { PlanInputs } from './plan-inputs.js';

// RF-601..RF-604, DEC-80: the hand-off package of a plan run from its inputs, the planner's checked
// content and the catalogue: the supported cards it may cite, the claims left out with their ids,
// the brief's questions that took their default with that default, and the open questions of the
// analysis that have no answer.

function principleOf(catalogue: Catalogue, id: string): PackagePrinciple {
  const entry = catalogue.entries.find((each) => each.id === id);
  return entry === undefined
    ? { id, title: id, rule: '' }
    : { id, title: entry.title, rule: entry.rule };
}

// RF-601, RF-604
export function handoffPackageOf(
  inputs: PlanInputs,
  content: PlanContent,
  catalogue: Catalogue,
): HandoffPackage {
  const { brief, sourceRun, project, cards, questions } = inputs;
  return {
    repository: { url: project.sourceUrl, commitSha: sourceRun.commitSha },
    sourceRun: sourceRun.runKey,
    brief,
    style: principleOf(catalogue, brief.architecture.style),
    principles: brief.principles.map((id) => principleOf(catalogue, id)),
    content,
    sources: supportedCards(cards),
    excluded: excludedClaims(cards),
    briefQuestions: defaultedQuestions(brief, catalogue),
    openQuestions: questions
      .filter((question) => question.answer.trim() === '')
      .map(({ cardId, question }) => ({ cardId, question })),
  };
}
