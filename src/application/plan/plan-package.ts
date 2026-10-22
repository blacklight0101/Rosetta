import { decideOnce } from '../../domain/planning/brief-restated.js';
import { defaultedQuestions } from '../../domain/planning/brief-questions.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PlanContent } from '../../domain/planning/plan-content.js';
import { prdQuestions } from '../../domain/planning/prd-content.js';
import { addStyleRisks, checkStyle } from '../../domain/planning/style-rules.js';
import { excludedClaims, supportedCards } from '../../domain/planning/plan-sources.js';
import type { LeftOutCard } from '../../domain/planning/left-out-card.js';
import type { HandoffPackage, PackagePrinciple } from './handoff-package.js';
import type { PlannedDocuments } from './plan-documents.js';
import type { ScanShapes } from '../../domain/planning/scan-shapes.js';
import type { WorkbookFormulas } from '../../domain/planning/workbook-formulas.js';
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

/** The open questions of the analysis, those nobody answered, with the area of their card. */
function openQuestionsOf(
  questions: PlanInputs['questions'],
  cards: PlanInputs['cards'],
): HandoffPackage['openQuestions'] {
  return questions
    .filter((question) => question.answer.trim() === '')
    .map(({ cardId, question }) => ({
      ...{ cardId, question },
      area: cards.find((card) => card.id === cardId)?.area ?? '',
    }));
}

/** P3-101: the task cards the answer left out, by position, for checks.md. */
function taskCardItems(cards: readonly LeftOutCard[]): HandoffPackage['leftOut'] {
  return cards.map((each) => ({
    area: 'Task cards',
    item: String(each.position),
    field: each.field,
    reason: each.reason,
  }));
}

/** P3-102: the data-model parts the parser dropped, for checks.md (area "Data model"). */
function dataModelItems(
  problems: PlannedDocuments['dataModelProblems'],
): HandoffPackage['leftOut'] {
  return problems.map((each) => ({
    area: 'Data model',
    item: each.item,
    field: each.field,
    reason: each.reason,
  }));
}

// RF-601, RF-604
export function handoffPackageOf(
  inputs: PlanInputs,
  content: PlanContent,
  catalogue: Catalogue,
  documents: PlannedDocuments & {
    readonly shapes: ScanShapes | undefined;
    readonly workbookFormulas: WorkbookFormulas | undefined;
    readonly leftOut: readonly LeftOutCard[];
  },
): HandoffPackage {
  const { prd, dataModel, flows, apiContract, ux, incomplete } = documents;
  const { brief, sourceRun, project, cards, questions, upload } = inputs;
  const sources = supportedCards(cards);
  const supported = new Set(sources.map((card) => card.id));
  const decided = decideOnce(content, brief, catalogue, supported);
  const style = principleOf(catalogue, brief.architecture.style);
  const styleCheck = checkStyle(brief.architecture.style, decided.content.components);
  return {
    repository: { url: project.sourceUrl, commitSha: sourceRun.commitSha },
    ...(upload === undefined ? {} : { upload }),
    sourceRun: sourceRun.runKey,
    brief,
    style,
    principles: brief.principles.map((id) => principleOf(catalogue, id)),
    content: {
      ...decided.content,
      risks: addStyleRisks(decided.content.risks, styleCheck, style.title),
    },
    choices: decided.choices,
    restated: decided.restated,
    styleCheck,
    sources,
    excluded: excludedClaims(cards),
    briefQuestions: defaultedQuestions(brief, catalogue),
    openQuestions: openQuestionsOf(questions, cards),
    prd,
    dataModel,
    flows,
    apiContract,
    ux,
    prdQuestions: prdQuestions(prd),
    shapes: documents.shapes,
    workbookFormulas: documents.workbookFormulas,
    incomplete,
    leftOut: [...taskCardItems(documents.leftOut), ...dataModelItems(documents.dataModelProblems)],
  };
}
