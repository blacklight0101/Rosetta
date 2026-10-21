import type { Catalogue } from './catalogue.js';
import { briefDecisions, type BriefChoices } from './brief-decisions.js';
import { migrationStrategyInfo } from './migration-strategy.js';
import { planId, type PlanContent, type PlanDecision } from './plan-content.js';
import type { PlanningBrief } from './planning-brief.js';
import type { TechnicalContent } from './technical-content.js';

// RF-608, RF-609, RF-610: a decision the brief records is not written twice. The package writes a
// record for the architecture style, for each answered stack layer and for the migration strategy
// (brief-decisions.ts). A planner decision with no source card whose title or text names one of
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

/** The words of a text, lower case, in order. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== '');
}

function isVersion(word: string): boolean {
  return /^v?\d+$/u.test(word);
}

function hasPhrase(words: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0) return false;
  return words.some((_, at) => phrase.every((word, offset) => words[at + offset] === word));
}

/** Where the brief decides a choice: the style, the migration or the answered layer at `layer`. */
type Where =
  | { readonly kind: 'style' }
  | { readonly kind: 'migration' }
  | { readonly kind: 'layer'; readonly index: number };

interface ChoiceNames {
  readonly where: Where;
  readonly phrases: readonly (readonly string[])[];
}

/** The ways the planner may name a style: its title without the note in brackets, and the note. */
function styleNames(brief: PlanningBrief, catalogue: Catalogue): string[] {
  return catalogue.styles
    .filter((style) => style.id === brief.architecture.style)
    .flatMap((style) => {
      const note = /\(([^)]*)\)/u.exec(style.title)?.[1] ?? '';
      return [style.title.replace(/\([^)]*\)/gu, ''), note];
    });
}

const migrationWords: Readonly<Record<PlanningBrief['migration'], readonly string[]>> = {
  'strangler-fig': [],
  'parallel-change': [],
  rewrite: ['complete rewrite', 'big bang'],
};

function choiceNames(brief: PlanningBrief, catalogue: Catalogue): ChoiceNames[] {
  const migration = [
    migrationStrategyInfo[brief.migration].title,
    ...migrationWords[brief.migration],
  ];
  const layers = brief.stack.map((entry, index) => {
    const words = wordsOf(entry.choice).filter((word) => !isVersion(word));
    const named = words.length === 1 && (words[0]?.length ?? 0) < 3 ? [] : [words];
    return { where: { kind: 'layer', index } as const, phrases: named };
  });
  return [
    { where: { kind: 'style' }, phrases: styleNames(brief, catalogue).map(wordsOf) },
    { where: { kind: 'migration' }, phrases: migration.map(wordsOf) },
    ...layers,
  ];
}

function restates(decision: PlanDecision, names: readonly ChoiceNames[]): Where | undefined {
  if (decision.sources.length > 0) return undefined;
  const words = [...wordsOf(decision.title), '', ...wordsOf(decision.decision)];
  return names.find((choice) => choice.phrases.some((phrase) => hasPhrase(words, phrase)))?.where;
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

// RF-608, RF-609, RF-610
export function decideOnce(
  content: PlanContent,
  brief: PlanningBrief,
  catalogue: Catalogue,
  supported: ReadonlySet<string>,
): DecidedOnce {
  const names = choiceNames(brief, catalogue);
  const found = content.decisions.map((decision) => restates(decision, names));
  const kept = content.decisions.filter((_, at) => found[at] === undefined);
  const fromBrief = briefDecisions(brief, catalogue, supported, kept.length);
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
    },
    choices: fromBrief.choices,
    restated,
  };
}
