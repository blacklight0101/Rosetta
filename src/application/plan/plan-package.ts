import { briefDecisions } from '../../domain/planning/brief-decisions.js';
import { defaultedQuestions } from '../../domain/planning/brief-questions.js';
import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PlanContent } from '../../domain/planning/plan-content.js';
import { prdQuestions, type PrdContent } from '../../domain/planning/prd-content.js';
import { excludedClaims, supportedCards } from '../../domain/planning/plan-sources.js';
import type { HandoffPackage, PackagePrinciple } from './handoff-package.js';
import type { ScanShapes } from '../../domain/planning/scan-shapes.js';
import type { PlanInputs } from './plan-inputs.js';

// RF-601..RF-604, RF-621, DEC-80: the hand-off package of a plan run from its inputs, the planner's checked
// content and the catalogue: the supported cards it may cite, the claims left out with their ids,
// the brief's questions that took their default with that default, and the open questions of the
// analysis that have no answer.

function principleOf(catalogue: Catalogue, id: string): PackagePrinciple {
  const entry = catalogue.entries.find((each) => each.id === id);
  if (entry === undefined) {
    return { id, title: id, rule: '', why: '', check: '', group: undefined };
  }
  const { title, rule, why, check, group } = entry;
  return { id, title, rule, why, check, group };
}

// RF-601, RF-604
export function handoffPackageOf(
  inputs: PlanInputs,
  content: PlanContent,
  catalogue: Catalogue,
  documents: {
    readonly prd: PrdContent;
    readonly dataModel: TargetDataModel;
    readonly shapes: ScanShapes | undefined;
  },
): HandoffPackage {
  const { prd, dataModel } = documents;
  const { brief, sourceRun, project, cards, questions } = inputs;
  const sources = supportedCards(cards);
  const supported = new Set(sources.map((card) => card.id));
  const fromBrief = briefDecisions(brief, catalogue, supported, content.decisions.length);
  return {
    repository: { url: project.sourceUrl, commitSha: sourceRun.commitSha },
    sourceRun: sourceRun.runKey,
    brief,
    style: principleOf(catalogue, brief.architecture.style),
    principles: brief.principles.map((id) => principleOf(catalogue, id)),
    content: { ...content, decisions: [...content.decisions, ...fromBrief.decisions] },
    choices: fromBrief.choices,
    sources,
    excluded: excludedClaims(cards),
    briefQuestions: defaultedQuestions(brief, catalogue),
    openQuestions: questions
      .filter((question) => question.answer.trim() === '')
      .map(({ cardId, question }) => ({ cardId, question })),
    prd,
    dataModel,
    prdQuestions: prdQuestions(prd),
    shapes: documents.shapes,
  };
}
