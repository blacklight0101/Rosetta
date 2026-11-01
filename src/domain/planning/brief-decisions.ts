import type { ArchitectureStyle, Catalogue } from './catalogue.js';
import { layerNames } from './brief-questions.js';
import { migrationStrategyInfo } from './migration-strategy.js';
import {
  describingCards,
  stackConsequences,
  stackContext,
  stackOptions,
  touchingTasks,
} from './stack-adr.js';
import type { StackTechnology } from './stack-data.js';
import type { SourceCard } from './plan-sources.js';
import { planId, type PlanDecision } from './plan-content.js';
import { migrationStrategies, type PlanningBrief, type StackLayer } from './planning-brief.js';
import { checkReference, typedAnswers } from './typed-answers.js';
import type { PlanProposal, StrategyFit } from './stack-proposal.js';
import type { WorkbookSetup } from './workbook-setup.js';
import { accessChoices, workbookDecisions } from './workbook-decisions.js';

// RF-608, RF-609, RF-610, ADR-018, DEC-76, DEC-78: the choices of the planning brief as decision
// records of the package: one for the architecture style, one for each stack layer the owner chose
// and one for the migration strategy. The planner writes none of them: the text comes from the
// brief and the catalogue, the evidence is the cards the recommendation named (only those with a
// supported claim), and a choice nobody made, which took its default, is `Proposed` and says so.

interface PackageStack {
  readonly layer: StackLayer;
  /** The layer in words, for example "language and runtime". */
  readonly name: string;
  /** The chosen technology, free text (untrusted). */
  readonly choice: string;
  /** The id of the decision record of the layer. */
  readonly decision: string;
  /** P5-39: Rosetta proposed it; the owner left the layer open. */
  readonly proposed?: boolean;
}

/** Where the brief's choices are decided in the package. */
export interface BriefChoices {
  readonly style: string;
  readonly migration: string;
  readonly stack: readonly PackageStack[];
  /** P5-39: the record of the seam between the two systems; empty when there is none. */
  readonly seam?: string;
  /** RF-648, RF-649: the records of the sign-in and the secrets store of a workbook; empty when none. */
  readonly signIn?: string;
  readonly secrets?: string;
}

/** What the records of the brief are written from (RF-609): the supported cards, in card order, and the task cards. */
export interface BriefEvidence {
  /** The ids of the cards with a supported claim. */
  readonly supported: ReadonlySet<string>;
  readonly cards: readonly SourceCard[];
  readonly tasks: readonly {
    readonly id: string;
    readonly title: string;
    readonly files: readonly string[];
  }[];
  /** P5-39: what Rosetta proposed, when it could. */
  readonly proposal?: PlanProposal | undefined;
  /** RF-648, RF-649: the answers of a project of workbooks; absent for any other source. */
  readonly workbook?: WorkbookSetup | undefined;
}

export interface BriefDecisions {
  readonly decisions: readonly PlanDecision[];
  readonly choices: BriefChoices;
}

function layerName(layer: StackLayer): string {
  return layerNames[layer] ?? layer;
}

function styleLine(style: ArchitectureStyle, chosen: boolean): string {
  const name = chosen ? `${style.title} (chosen)` : style.title;
  const choose = `Choose it when: ${style.chooseWhen.join('; ')}.`;
  return `${name}: ${style.rule} ${choose} Look elsewhere when: ${style.avoidWhen.join('; ')}.`;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function styleDecision(
  brief: PlanningBrief,
  catalogue: Catalogue,
  supported: ReadonlySet<string>,
  id: string,
): PlanDecision | undefined {
  const { style, recommended, evidence } = brief.architecture;
  const chosen = catalogue.styles.find((each) => each.id === style);
  if (chosen === undefined) return undefined;
  const considered = unique([...recommended, style]).flatMap((each) =>
    catalogue.styles.filter((entry) => entry.id === each),
  );
  const sources = unique(evidence.filter((card) => supported.has(card)));
  const recommendation =
    recommended.length === 0
      ? 'Rosetta made no recommendation for this brief.'
      : `Rosetta recommended ${recommended.map((each) => catalogue.styles.find((entry) => entry.id === each)?.title ?? each).join(' and ')} from the code map and the verified cards.`;
  const own = typedAnswers(brief).architecture;
  if (own !== undefined)
    return ownStyleDecision({ brief, chosen, considered, sources, recommendation }, own, id);
  const unchosen = brief.defaulted.includes('architecture');
  return {
    id,
    title: `Architecture style: ${chosen.title}`,
    status: unchosen ? 'Proposed' : 'Accepted',
    context: `The new system needs an architecture style. ${recommendation} ${sources.length === 0 ? 'No supported card is named as evidence.' : 'The source cards below are the evidence.'}`,
    decision: `Follow the ${chosen.title} style. ${chosen.rule}${unchosen ? ' Nobody chose a style, so this is the default; confirm or change it.' : ''}`,
    consequences: `The components of the target architecture follow the style. How to check it: ${chosen.check}`,
    options: considered.map((each) => styleLine(each, each.id === style)),
    sources,
  };
}

/** DEC-184: the owner typed the style, so the record states the answer; the default style is only the reference of the checks. */
function ownStyleDecision(
  parts: {
    readonly brief: PlanningBrief;
    readonly chosen: ArchitectureStyle;
    readonly considered: readonly ArchitectureStyle[];
    readonly sources: readonly string[];
    readonly recommendation: string;
  },
  own: string,
  id: string,
): PlanDecision {
  const { chosen, considered, sources, recommendation } = parts;
  return {
    id,
    title: "Architecture style: the owner's own answer",
    status: 'Accepted',
    context: `The new system needs an architecture style. The owner typed an answer instead of choosing one of the styles. ${recommendation}`,
    decision: `Follow the owner's own answer: ${own}`,
    consequences: `The components of the target architecture follow the owner's answer. Rosetta's automatic dependency check knows only its catalogue, so it compares them with ${chosen.title}, the default style and ${checkReference('style')}. How to check that style: ${chosen.check}`,
    options: [...considered.map((each) => styleLine(each, false)), `Own answer (chosen): ${own}`],
    sources: [...sources],
  };
}

function migrationDecision(brief: PlanningBrief, id: string, fit?: StrategyFit): PlanDecision {
  const info = migrationStrategyInfo[brief.migration];
  const changed = fit?.changedFrom !== undefined && fit.changedFrom !== null;
  const unchosen = brief.defaulted.includes('migration') || changed;
  const why = fit?.reason ?? '';
  const nobody = changed
    ? ' Nobody chose a strategy, so Rosetta proposes this one; confirm or change it.'
    : ' Nobody chose a strategy, so this is the default; confirm or change it.';
  return {
    id,
    title: `Migration strategy: ${info.title}`,
    status: unchosen ? 'Proposed' : 'Accepted',
    context: `The legacy system has to be replaced by the new one. The strategy decides in which order the phases of the roadmap run.${why === '' ? '' : ` ${why}`}`,
    decision: `Follow ${info.title}. ${info.ordering}${unchosen ? nobody : ''}`,
    consequences: info.tradeOff,
    options: migrationStrategies.map((each) => {
      const option = migrationStrategyInfo[each];
      const name = each === brief.migration ? `${option.title} (chosen)` : option.title;
      return `${name}: ${option.tradeOff}`;
    }),
    sources: [],
  };
}

/** DEC-184: the owner typed the strategy, so the record states the answer and the strategies are only the reference. */
function ownMigrationDecision(brief: PlanningBrief, own: string, id: string): PlanDecision {
  const info = migrationStrategyInfo[brief.migration];
  return {
    id,
    title: "Migration strategy: the owner's own answer",
    status: 'Accepted',
    context:
      'The legacy system has to be replaced by the new one. The owner typed an answer instead of choosing one of the strategies, and the answer decides in which order the phases of the roadmap run.',
    decision: `Follow the owner's own answer: ${own}`,
    consequences: `The phases of the roadmap and the cut-over card follow the owner's answer. ${info.title}, the default strategy, is ${checkReference('strategy')}, not the chosen strategy: ${info.tradeOff}`,
    options: [
      ...migrationStrategies.map(
        (each) => `${migrationStrategyInfo[each].title}: ${migrationStrategyInfo[each].tradeOff}`,
      ),
      `Own answer (chosen): ${own}`,
    ],
    sources: [],
  };
}

function stackDecision(
  entry: PlanningBrief['stack'][number],
  id: string,
  evidence: BriefEvidence,
  technologies: readonly StackTechnology[],
): PlanDecision {
  const { proposal } = evidence;
  const name = layerName(entry.layer);
  const proposed = entry.proposed === true;
  const why = proposal?.layers.find((each) => each.layer === entry.layer)?.why ?? '';
  const kind = proposal?.kind ?? 'web';
  const origin = proposed
    ? `Nobody chose this layer, so Rosetta proposes the catalogue's option for a ${kind} application: ${why} Confirm or change it in Plan setup; the owner's choice always wins.`
    : entry.custom
      ? 'The owner typed this choice.'
      : 'The owner picked it from the options Rosetta offered.';
  const touching = touchingTasks(evidence.tasks, technologies, entry);
  return {
    id,
    title: `Technology for the ${name} layer: ${entry.choice}`,
    status: proposed ? 'Proposed' : 'Accepted',
    context: stackContext(name, entry.layer, evidence.cards),
    decision: `Use ${entry.choice} for the ${name} layer. ${origin}`,
    consequences: stackConsequences(name, entry.choice, touching),
    options: proposed ? [`${entry.choice} (proposed): ${why}`] : stackOptions(technologies, entry),
    sources: describingCards(evidence.cards, entry.layer).map((card) => card.id),
  };
}

function seamDecision(fit: StrategyFit, id: string): PlanDecision {
  return {
    id,
    title: 'Seam between the legacy client and the new system: the shared database',
    status: 'Proposed',
    context: fit.reason,
    decision:
      'Run the new system against the legacy schema until the last phase. Each phase replaces a part of the client and both systems read and write the same tables. Confirm or change it.',
    consequences:
      'The new data model must keep the legacy tables and keys until the legacy client is switched off; a change to the schema needs both systems to agree.',
    options: [
      'Shared database (proposed): the one place both systems already meet.',
      'Full rewrite with one cut-over: no seam is needed, but nothing reaches users before the end.',
    ],
    sources: [],
  };
}

function presentOnly(decisions: readonly (PlanDecision | undefined)[]): PlanDecision[] {
  return decisions.flatMap((decision) => (decision === undefined ? [] : [decision]));
}

/** The decision records of the brief's choices, numbered after the `after` planner decisions. */
// RF-608, RF-609, RF-610
export function briefDecisions(
  brief: PlanningBrief,
  catalogue: Catalogue,
  evidence: BriefEvidence,
  after: number,
): BriefDecisions {
  const { proposal } = evidence;
  let next = after;
  const nextId = (): string => planId('ADR', ++next);
  const style = styleDecision(brief, catalogue, evidence.supported, nextId());
  const layers = brief.stack.map((entry) =>
    stackDecision(entry, nextId(), evidence, catalogue.stack.technologies),
  );
  const ownMigration = typedAnswers(brief).migration;
  const migration =
    ownMigration === undefined
      ? migrationDecision(brief, nextId(), proposal?.fit)
      : ownMigrationDecision(brief, ownMigration, nextId());
  const seam = proposal?.fit.seam ? seamDecision(proposal.fit, nextId()) : undefined;
  const access = workbookDecisions(evidence.workbook, nextId);
  return {
    decisions: presentOnly([style, ...layers, migration, seam, ...access]),
    choices: {
      style: style?.id ?? '',
      migration: migration.id,
      seam: seam?.id ?? '',
      ...accessChoices(access),
      stack: brief.stack.map((entry, index) => ({
        ...{ layer: entry.layer, name: layerName(entry.layer), choice: entry.choice },
        ...(entry.proposed === true ? { proposed: true } : {}),
        decision: layers[index]?.id ?? '',
      })),
    },
  };
}
