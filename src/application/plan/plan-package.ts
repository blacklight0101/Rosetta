import { stackClashes } from '../../domain/planning/stack-rules.js';
import { decideOnce } from '../../domain/planning/brief-restated.js';
import { defaultedQuestions } from '../../domain/planning/brief-questions.js';
import { copiedExamples, exampleSentencesOfAll } from '../../domain/planning/copied-example.js';
import { settleJudgements } from '../../domain/planning/claim-judgement.js';
import type { ApiContract } from '../../domain/planning/api-contract.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PlanContent } from '../../domain/planning/plan-content.js';
import { prdQuestions, type PrdContent } from '../../domain/planning/prd-content.js';
import { addStyleRisks, checkStyle } from '../../domain/planning/style-rules.js';
import {
  excludedClaims,
  sourceStopOf,
  supportedCards,
  type SourceCard,
} from '../../domain/planning/plan-sources.js';
import type { Run } from '../../domain/runs/run.js';
import type { LeftOutCard } from '../../domain/planning/left-out-card.js';
import type { UnreadableItem } from '../../domain/planning/plan-draft.js';
import { placeOf } from './plan-repair.js';
import type { HandoffPackage, PackagePrinciple } from './handoff-package.js';
import type { PlannedDocuments } from './plan-documents.js';
import type { PlanProposal } from '../../domain/planning/stack-proposal.js';
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

/** The checked content with the style risks added and the judgements settled. */
function contentOf(
  content: PlanContent,
  checked: {
    readonly styleCheck: HandoffPackage['styleCheck'];
    readonly style: PackagePrinciple;
    readonly questions: PlanInputs['questions'];
  },
): PlanContent {
  const { styleCheck, style, questions } = checked;
  return {
    ...content,
    risks: addStyleRisks(content.risks, styleCheck, style.title),
    ...settledJudgements(content, questions),
  };
}

/** P5-41: the judgements, a change by an answer nobody gave being a defect to decide. */
function settledJudgements(
  content: PlanContent,
  questions: PlanInputs['questions'],
): Pick<PlanContent, 'judgements'> {
  if (content.judgements === undefined) return {};
  const answered = new Set(
    questions.filter((each) => each.answer.trim() !== '').map((each) => each.cardId),
  );
  return { judgements: settleJudgements(content.judgements, answered) };
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

/** P3-126: the items of the other lists of the answer that could not be read, for checks.md. */
function unreadableItems(items: readonly UnreadableItem[]): HandoffPackage['leftOut'] {
  return items.map((each) => ({
    area: 'Plan answer',
    item: placeOf(each),
    field: each.field,
    reason: each.reason,
  }));
}

/** P3-101, P3-102, P3-126: every part of the plan the package leaves out, for checks.md. */
export function leftOutItems(documents: {
  readonly leftOut: readonly LeftOutCard[];
  readonly unreadable: readonly UnreadableItem[];
  readonly dataModelProblems: PlannedDocuments['dataModelProblems'];
}): HandoffPackage['leftOut'] {
  return [
    ...taskCardItems(documents.leftOut),
    ...unreadableItems(documents.unreadable),
    ...dataModelItems(documents.dataModelProblems),
  ];
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

/** P3-117: the sentences of the PRD and the plan that copy an example of a planner prompt. */
function copiedIn(
  prd: PrdContent,
  plan: PlanContent,
  promptTexts: readonly string[],
): HandoffPackage['copiedExamples'] {
  return copiedExamples({ prd, plan }, exampleSentencesOfAll(promptTexts));
}

/** The folder of the source run and, RF-604 P3-121, its stop when it ended at a cap. */
function sourceOf(
  run: Pick<Run, 'runKey' | 'endState'>,
  cards: readonly SourceCard[],
): Pick<HandoffPackage, 'sourceRun' | 'sourceStop'> {
  const stop = sourceStopOf(run.endState, cards);
  return stop === undefined
    ? { sourceRun: run.runKey }
    : { sourceRun: run.runKey, sourceStop: stop };
}

/** RF-609: the supported cards the stack records are written from, with their ids. */
function evidenceOf(
  sources: readonly SourceCard[],
  proposal: PlanProposal | undefined,
): {
  supported: ReadonlySet<string>;
  cards: readonly SourceCard[];
  proposal: PlanProposal | undefined;
} {
  return { supported: new Set(sources.map((card) => card.id)), cards: sources, proposal };
}

/** RF-609, P5-39: the clashes of the stack and, when Rosetta made any, its proposals. */
function stackFindings(
  brief: PlanningBrief,
  contract: ApiContract,
  catalogue: Catalogue,
  proposal: PlanProposal | undefined,
): Pick<HandoffPackage, 'stackClashes' | 'proposal'> {
  const stackClashList = stackClashes(brief, contract, catalogue.stack);
  return proposal === undefined
    ? { stackClashes: stackClashList }
    : { stackClashes: stackClashList, proposal };
}

/** The parts of the planned documents the package carries as they are. */
function carried(
  documents: Pick<HandoffPackage, 'shapes' | 'workbookFormulas' | 'incomplete' | 'leftOut'>,
): Pick<HandoffPackage, 'shapes' | 'workbookFormulas' | 'incomplete' | 'leftOut'> {
  const { shapes, workbookFormulas, incomplete, leftOut } = documents;
  return { shapes, workbookFormulas, incomplete, leftOut };
}

// RF-601, RF-604
export function handoffPackageOf(
  inputs: PlanInputs,
  content: PlanContent,
  catalogue: Catalogue,
  documents: PlannedDocuments & {
    readonly shapes: ScanShapes | undefined;
    readonly workbookFormulas: WorkbookFormulas | undefined;
    readonly leftOut: HandoffPackage['leftOut'];
    /** P3-117: the texts of the planner prompts the example sentences are read from. */
    readonly examples: readonly string[];
    /** P5-39: what Rosetta proposed for the kind, the open stack layers and the strategy. */
    readonly proposal: PlanProposal | undefined;
  },
): HandoffPackage {
  const { prd, dataModel, flows, apiContract, ux } = documents;
  const { brief, sourceRun, project, cards, questions, upload } = inputs;
  const sources = supportedCards(cards);
  const decided = decideOnce(content, brief, catalogue, evidenceOf(sources, documents.proposal));
  const style = principleOf(catalogue, brief.architecture.style);
  const styleCheck = checkStyle(brief.architecture.style, decided.content.components);
  return {
    repository: { url: project.sourceUrl, commitSha: sourceRun.commitSha },
    ...(upload === undefined ? {} : { upload }),
    ...sourceOf(sourceRun, cards),
    brief,
    style,
    principles: brief.principles.map((id) => principleOf(catalogue, id)),
    content: contentOf(decided.content, { styleCheck, style, questions }),
    choices: decided.choices,
    restated: decided.restated,
    styleCheck,
    ...stackFindings(brief, apiContract, catalogue, documents.proposal),
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
    ...carried(documents),
    copiedExamples: copiedIn(prd, decided.content, documents.examples),
  };
}
