import type { Catalogue } from './catalogue.js';
import { briefDecisions, type BriefChoices, type BriefEvidence } from './brief-decisions.js';
import { layerNames } from './brief-questions.js';
import { migrationStrategyInfo } from './migration-strategy.js';
import { hasPhrase, isVersion, wordsOf } from './restated-words.js';
import { restatedBySubject, sayingTyped, type BriefNames } from './restated-subject.js';
import { typedAnswers } from './typed-answers.js';
import type { ClaimJudgement } from './claim-judgement.js';
import { planId, type PlanContent, type PlanDecision } from './plan-content.js';
import type { PlanningBrief } from './planning-brief.js';
import type { TechnicalContent } from './technical-content.js';

// RF-608, RF-609, RF-610: a decision the brief records is not written twice. The package writes a
// record for the architecture style, for each answered stack layer and for the migration strategy
// (brief-decisions.ts). A planner decision with no source card whose title names one of
// those choices only says it again, so it is left out; the links that pointed at it point at the
// brief's record, and the records that stay are numbered in order again. The match is on whole
// words, never on part of one, and a name of one or two letters or a version alone names nothing.

/** A planner decision the package left out because the brief's record already decides it. */
export interface RestatedDecision {
  readonly title: string;
  /** The id of the brief's record that decides it. */
  readonly record: string;
}

export interface DecidedOnce {
  readonly content: PlanContent;
  readonly choices: BriefChoices;
  readonly restated: readonly RestatedDecision[];
}

/** Where the brief decides a choice: the style, the migration or the answered layer at `layer`. */
type Where =
  | { readonly kind: 'style' }
  | { readonly kind: 'migration' }
  | { readonly kind: 'layer'; readonly index: number };

type Words = readonly string[];

interface ChoiceNames {
  readonly where: Where;
  /** Whether a title, as words, restates the choice. */
  readonly names: (title: Words) => boolean;
}

const choosingVerbs = ['use', 'adopt', 'choose', 'select', 'pick'];
const styleSubjects = ['architecture', 'architectural', 'style', 'pattern'];

const has = (title: Words, phrase: Words): boolean => hasPhrase(title, phrase);
const hasAny = (title: Words, phrases: readonly Words[]): boolean =>
  phrases.some((phrase) => has(title, phrase));

/** The ways a title may name a style: its title without the note in brackets, and the note. */
function styleNames(brief: PlanningBrief, catalogue: Catalogue): Words[] {
  return catalogue.styles
    .filter((style) => style.id === brief.architecture.style)
    .flatMap((style) => {
      const note = /\(([^)]*)\)/u.exec(style.title)?.[1] ?? '';
      return [style.title.replace(/\([^)]*\)/gu, ''), note, style.id].map(wordsOf);
    });
}

/** A title restates the style when it names it as the architecture, not as a word in another subject. */
function namesStyle(brief: PlanningBrief, catalogue: Catalogue): (title: Words) => boolean {
  const names = styleNames(brief, catalogue);
  return (title) => hasAny(title, names) && styleSubjects.some((word) => title.includes(word));
}

const strategyNames: Readonly<Record<PlanningBrief['migration'], readonly Words[]>> = {
  'strangler-fig': [['strangler']],
  'parallel-change': [['parallel', 'change']],
  rewrite: [
    ['full', 'rewrite'],
    ['complete', 'rewrite'],
    ['big', 'bang'],
  ],
};

function namesMigration(brief: PlanningBrief): (title: Words) => boolean {
  const names = [
    ...strategyNames[brief.migration],
    wordsOf(migrationStrategyInfo[brief.migration].title),
  ];
  const cutOver = brief.migration === 'rewrite';
  return (title) =>
    hasAny(title, names) ||
    (cutOver &&
      title[0] === 'rewrite' &&
      (title.includes('cutover') || has(title, ['cut', 'over'])));
}

/** The ways a title may name a layer: its name, and the two first words written as one. */
function layerAliases(layer: string): Words[] {
  const words = wordsOf(layerNames[layer] ?? layer);
  return [words, words.slice(0, 2), [words.slice(0, 2).join('')]];
}

function namesTechnology(entry: PlanningBrief['stack'][number]): (title: Words) => boolean {
  const words = wordsOf(entry.choice).filter((word) => !isVersion(word));
  const unnamed = words.length === 0 || (words.length === 1 && (words[0]?.length ?? 0) < 3);
  const aliases = layerAliases(entry.layer);
  return (title) =>
    !unnamed &&
    has(title, words) &&
    (choosingVerbs.includes(title[0] ?? '') || hasAny(title, aliases));
}

function choiceNames(brief: PlanningBrief, catalogue: Catalogue): ChoiceNames[] {
  const layers = brief.stack.map((entry, index) => ({
    where: { kind: 'layer', index } as const,
    names: namesTechnology(entry),
  }));
  return [
    { where: { kind: 'style' }, names: namesStyle(brief, catalogue) },
    { where: { kind: 'migration' }, names: namesMigration(brief) },
    ...layers,
  ];
}

/** The names the brief gives its choices, for the subject rule and the typed answers. */
function briefNames(brief: PlanningBrief, catalogue: Catalogue): BriefNames {
  const typed = typedAnswers(brief);
  return {
    style: styleNames(brief, catalogue),
    migration: [
      ...strategyNames[brief.migration],
      wordsOf(migrationStrategyInfo[brief.migration].title),
    ],
    stack: brief.stack.map((entry) => wordsOf(entry.choice)),
    typedStyle: wordsOf(typed.architecture ?? ''),
    typedMigration: wordsOf(typed.migration ?? ''),
  };
}

function layerOf(index: number, fallback: Where): Where {
  return index < 0 ? fallback : { kind: 'layer', index };
}

/**
 * RF-608: a decision with no source restates a choice when its title names it, when its title says
 * the typed answer, or when its title is only a subject and its text names the choice (DEC-187).
 * A title about something else may name a choice in its text in passing.
 */
function restates(
  decision: PlanDecision,
  names: readonly ChoiceNames[],
  brief: BriefNames,
): Where | undefined {
  if (decision.sources.length > 0) return undefined;
  const title = wordsOf(decision.title);
  const byTitle = names.find((choice) => choice.names(title))?.where;
  if (byTitle !== undefined) return byTitle;
  if (sayingTyped(decision.title, brief.typedStyle, brief.style)) return { kind: 'style' };
  if (sayingTyped(decision.title, brief.typedMigration, brief.migration))
    return { kind: 'migration' };
  const found = restatedBySubject(decision.title, decision.decision, brief);
  if (found === undefined) return undefined;
  return layerOf(found.layer, { kind: found.subject === 'style' ? 'style' : 'migration' });
}

function recordOf(where: Where, choices: BriefChoices): string {
  if (where.kind === 'style') return choices.style;
  if (where.kind === 'migration') return choices.migration;
  return choices.stack[where.index]?.decision ?? '';
}

function relinked(technical: TechnicalContent, ids: ReadonlyMap<string, string>): TechnicalContent {
  const link = <T extends { readonly decision: string }>(item: T): T => ({
    ...item,
    decision: ids.get(item.decision) ?? item.decision,
  });
  return {
    integrations: technical.integrations.map(link),
    security: technical.security.map(link),
    targets: technical.targets.map(link),
    environments: technical.environments.map(link),
  };
}

/** P5-41: a judgement that names a decision follows the decision to its new id (or to the brief's record). */
function relinkedJudgement(
  judgement: ClaimJudgement,
  ids: ReadonlyMap<string, string>,
): ClaimJudgement {
  if (judgement.decisionId === undefined) return judgement;
  return { ...judgement, decisionId: ids.get(judgement.decisionId) ?? judgement.decisionId };
}

// RF-608, RF-609, RF-610
export function decideOnce(
  content: PlanContent,
  brief: PlanningBrief,
  catalogue: Catalogue,
  evidence: Omit<BriefEvidence, 'tasks'>,
): DecidedOnce {
  const names = choiceNames(brief, catalogue);
  const owned = briefNames(brief, catalogue);
  const found = content.decisions.map((decision) => restates(decision, names, owned));
  const kept = content.decisions.filter((_, at) => found[at] === undefined);
  const fromBrief = briefDecisions(
    brief,
    catalogue,
    { ...evidence, tasks: content.tasks },
    kept.length,
  );
  const ids = new Map<string, string>();
  const restated: RestatedDecision[] = [];
  let next = 0;
  content.decisions.forEach((decision, at) => {
    const where = found[at];
    if (where === undefined) {
      ids.set(decision.id, planId('ADR', ++next));
      return;
    }
    const record = recordOf(where, fromBrief.choices);
    ids.set(decision.id, record);
    restated.push({ title: decision.title, record });
  });
  return {
    content: {
      ...content,
      decisions: [
        ...kept.map((decision) => ({ ...decision, id: ids.get(decision.id) ?? decision.id })),
        ...fromBrief.decisions,
      ],
      technical: relinked(content.technical, ids),
      ...(content.judgements === undefined
        ? {}
        : { judgements: content.judgements.map((each) => relinkedJudgement(each, ids)) }),
    },
    choices: fromBrief.choices,
    restated,
  };
}
