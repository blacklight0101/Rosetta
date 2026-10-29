import { claimMeaning } from '../../domain/planning/claim-meaning.js';
import { usableCards } from '../../domain/planning/code-over-documentation.js';
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
import { addSecretRisks, type SecretRisks } from '../../domain/planning/secret-risks.js';
import type { ScanFacts } from './plan-scan-facts.js';
import { addStyleRisks, checkStyle } from '../../domain/planning/style-rules.js';
import { referenceTitle } from '../../domain/planning/typed-answers.js';
import {
  excludedClaims,
  sourceStopOf,
  type SourceCard,
} from '../../domain/planning/plan-sources.js';
import type { Run } from '../../domain/runs/run.js';
import type { LeftOutCard } from '../../domain/planning/left-out-card.js';
import type { UnreadableItem } from '../../domain/planning/plan-draft.js';
import { withFoundationCards } from '../../domain/planning/foundation-cards.js';
import { withOwnAnswerCards } from '../../domain/planning/own-answer-cards.js';
import { withPhaseClosingCards } from '../../domain/planning/phase-closing-cards.js';
import { placeOf } from './plan-repair.js';
import type { HandoffPackage, PackagePrinciple } from './handoff-package.js';
import type { PlannedDocuments } from './plan-documents.js';
import type { PlanProposal } from '../../domain/planning/stack-proposal.js';
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
    .map(({ cardId, question, options }) => ({
      ...{ cardId, question },
      ...(options === undefined ? {} : { options }),
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
    readonly secrets: SecretRisks;
  },
): PlanContent {
  const { styleCheck, style, questions, secrets } = checked;
  return {
    ...content,
    risks: addSecretRisks(
      addStyleRisks(content.risks, styleCheck, style.title),
      secrets.sites,
      secrets.template,
    ),
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
  documents: Pick<HandoffPackage, 'workbookFormulas' | 'incomplete' | 'leftOut'>,
  secrets: SecretRisks,
): Pick<HandoffPackage, 'workbookFormulas' | 'incomplete' | 'leftOut'> {
  const { workbookFormulas, incomplete, leftOut } = documents;
  return { workbookFormulas, incomplete, leftOut: [...leftOut, ...unreadSecretItems(secrets)] };
}

/** P5-34: a scan that could not be read is not "no plain-text secret"; checks.md says so. */
function unreadSecretItems(secrets: SecretRisks): HandoffPackage['leftOut'] {
  if (secrets.unread !== true) return [];
  return [
    {
      area: 'Risks',
      item: 'Plain-text secrets',
      field: 'scan',
      reason:
        'The scan could not be read, so the risks do not list the files that hold a plain-text secret. None was found and none was ruled out.',
    },
  ];
}

/** P5-42, P6-10, P6-21: the plan with its fixed and phase-closing cards, with the brief's choices decided once over it. */
function decidedOf(
  content: PlanContent,
  parts: {
    readonly brief: PlanningBrief;
    readonly sources: readonly SourceCard[];
    readonly documents: Pick<PlannedDocuments, 'dataModel'> & {
      readonly proposal: PlanProposal | undefined;
    };
  },
  catalogue: Catalogue,
): ReturnType<typeof decideOnce> {
  const { brief, sources, documents } = parts;
  const withFixed = withPhaseClosingCards(
    withFoundationCards(content, brief.migration, documents.dataModel.tables),
  );
  const decided = decideOnce(withFixed, brief, catalogue, evidenceOf(sources, documents.proposal));
  // RF-645, DEC-184: the fixed cards follow an own answer, which is known by its record only now.
  return { ...decided, content: withOwnAnswerCards(decided.content, brief, decided.choices) };
}

/** P5-43, RF-602: where the plan changed the meaning of its claims. */
function meaningOf(
  plan: PlanContent,
  parts: Pick<HandoffPackage, 'prd' | 'flows' | 'sources'> & {
    readonly overruled: Parameters<typeof claimMeaning>[0]['overruled'];
  },
  catalogue: Catalogue,
): HandoffPackage['meaning'] {
  const { prd, flows, sources, overruled } = parts;
  return claimMeaning({ plan, prd, flows, sources, overruled }, catalogue.claimVerbs);
}

/** The documents of the planner and what the scan gave, besides the plan itself. */
type PackageDocuments = PlannedDocuments &
  ScanFacts & {
    readonly leftOut: HandoffPackage['leftOut'];
    /** P3-117: the texts of the planner prompts the example sentences are read from. */
    readonly examples: readonly string[];
    /** P5-39: what Rosetta proposed for the kind, the open stack layers and the strategy. */
    readonly proposal: PlanProposal | undefined;
  };

// RF-601, RF-604
export function handoffPackageOf(
  inputs: PlanInputs,
  content: PlanContent,
  catalogue: Catalogue,
  documents: PackageDocuments,
): HandoffPackage {
  const { prd, dataModel, flows, apiContract, ux } = documents;
  const { brief, sourceRun, project, cards, questions, upload } = inputs;
  const { cards: sources, overruled } = usableCards(cards, catalogue.claimVerbs);
  const decided = decidedOf(content, { brief, sources, documents }, catalogue);
  const style = principleOf(catalogue, brief.architecture.style);
  const styleCheck = checkStyle(brief.architecture.style, decided.content.components);
  return {
    repository: { url: project.sourceUrl, commitSha: sourceRun.commitSha },
    ...(upload === undefined ? {} : { upload }),
    ...sourceOf(sourceRun, cards),
    brief,
    style,
    principles: brief.principles.map((id) => principleOf(catalogue, id)),
    content: contentOf(decided.content, {
      styleCheck,
      style: { ...style, title: referenceTitle(brief, 'architecture', style.title) },
      questions,
      secrets: documents.secrets,
    }),
    ...{ choices: decided.choices, restated: decided.restated },
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
    ...carried(documents, documents.secrets),
    copiedExamples: copiedIn(prd, decided.content, documents.examples),
    grepRules: catalogue.grepRules,
    meaning: meaningOf(decided.content, { ...documents, sources, overruled }, catalogue),
  };
}
