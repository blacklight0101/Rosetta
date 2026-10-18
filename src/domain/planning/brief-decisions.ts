import type { ArchitectureStyle, Catalogue } from './catalogue.js';
import { layerNames } from './brief-questions.js';
import { migrationStrategyInfo } from './migration-strategy.js';
import { planId, type PlanDecision } from './plan-content.js';
import { migrationStrategies, type PlanningBrief, type StackLayer } from './planning-brief.js';

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
}

/** Where the brief's choices are decided in the package. */
export interface BriefChoices {
  readonly style: string;
  readonly migration: string;
  readonly stack: readonly PackageStack[];
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

function migrationDecision(brief: PlanningBrief, id: string): PlanDecision {
  const info = migrationStrategyInfo[brief.migration];
  const unchosen = brief.defaulted.includes('migration');
  return {
    id,
    title: `Migration strategy: ${info.title}`,
    status: unchosen ? 'Proposed' : 'Accepted',
    context:
      'The legacy system has to be replaced by the new one. The strategy decides in which order the phases of the roadmap run.',
    decision: `Follow ${info.title}. ${info.ordering}${unchosen ? ' Nobody chose a strategy, so this is the default; confirm or change it.' : ''}`,
    consequences: info.tradeOff,
    options: migrationStrategies.map((each) => {
      const option = migrationStrategyInfo[each];
      const name = each === brief.migration ? `${option.title} (chosen)` : option.title;
      return `${name}: ${option.tradeOff}`;
    }),
    sources: [],
  };
}

function stackDecision(entry: PlanningBrief['stack'][number], id: string): PlanDecision {
  const name = layerName(entry.layer);
  const origin = entry.custom
    ? 'The owner typed this choice.'
    : 'The owner picked it from the options Rosetta offered.';
  return {
    id,
    title: `Technology for the ${name} layer: ${entry.choice}`,
    status: 'Accepted',
    context: `The new system needs a technology for the ${name} layer. The package names a technology only where the owner chose one.`,
    decision: `Use ${entry.choice} for the ${name} layer. ${origin}`,
    consequences: `Every task card that touches the ${name} layer uses ${entry.choice}; changing the choice means changing this record first.`,
    options: [],
    sources: [],
  };
}

/** The decision records of the brief's choices, numbered after the `after` planner decisions. */
// RF-608, RF-609, RF-610
export function briefDecisions(
  brief: PlanningBrief,
  catalogue: Catalogue,
  supported: ReadonlySet<string>,
  after: number,
): BriefDecisions {
  let next = after;
  const nextId = (): string => planId('ADR', ++next);
  const style = styleDecision(brief, catalogue, supported, nextId());
  const layers = brief.stack.map((entry) => stackDecision(entry, nextId()));
  const migration = migrationDecision(brief, nextId());
  return {
    decisions: [...(style === undefined ? [] : [style]), ...layers, migration],
    choices: {
      style: style?.id ?? '',
      migration: migration.id,
      stack: brief.stack.map((entry, index) => ({
        ...{ layer: entry.layer, name: layerName(entry.layer), choice: entry.choice },
        decision: layers[index]?.id ?? '',
      })),
    },
  };
}
