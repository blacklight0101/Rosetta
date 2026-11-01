import type { Catalogue, PlanOptions, StackOffer, Wording } from '../../api/plan-schemas.js';
import { STEP_IDS, questionsOf, STACK_LAYERS, STYLE_GROUP } from './steps.js';

// RF-645, RF-605, DEC-178: the options of every Plan setup question, the way Claude Code asks: at
// least three, the recommended one first and marked, each with a one-line description, then "Type
// your own answer". A question with two natural answers adds a qualified third. The recommended
// option is the default that applies when the question is skipped (DEC-80: nothing is invented, so
// for a project-context question that is "leave it open").

export interface QuestionOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly recommended: boolean;
  /** For a project-context question: the text the option puts in the field. */
  readonly value?: string;
}

export const OWN_ANSWER = 'Type your own answer';

/** Every question of the six steps, in question order. */
export const OPTION_QUESTIONS: readonly string[] = STEP_IDS.flatMap((step) => questionsOf(step));

export interface OptionSources {
  readonly catalogue: Catalogue;
  readonly options: PlanOptions | undefined;
  /** P7-29: the catalogue's proposals of each layer; absent while they load or when they failed. */
  readonly offer?: StackOffer | undefined;
}

/** The title with its "(Recommended)" mark. */
export function optionTitle(option: QuestionOption): string {
  return option.recommended ? `${option.title} (Recommended)` : option.title;
}

/** P7-17: the fixed wording comes from the server, with the catalogue (one source with the package). */
const fromWording = (option: Wording): QuestionOption => ({
  id: option.id,
  title: option.title,
  description: option.description,
  recommended: option.id === 'open',
  value: option.value,
});

function principleOptions(catalogue: Catalogue): QuestionOption[] {
  const entries = catalogue.entries.filter((entry) => entry.group !== STYLE_GROUP);
  const options = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    description: entry.rule,
    recommended: entry.defaultOn,
  }));
  return [...options.filter((o) => o.recommended), ...options.filter((o) => !o.recommended)];
}

function architectureOptions({ catalogue, options }: OptionSources): QuestionOption[] {
  const recommended = options?.architecture.recommended;
  const styles = catalogue.entries.filter((entry) => entry.group === STYLE_GROUP);
  const proposed = options?.architecture.options.map((option) => option.style) ?? [];
  const order = [
    ...(recommended === undefined ? [] : [recommended]),
    ...proposed.filter((style) => style !== recommended),
    ...styles.map((entry) => entry.id).filter((id) => !proposed.includes(id)),
  ];
  return order.flatMap((id) => {
    const entry = styles.find((each) => each.id === id);
    if (entry === undefined) return [];
    return [{ id, title: entry.title, description: entry.rule, recommended: id === recommended }];
  });
}

/** P7-10: the planner's description of the option; the generic line when it gave none. */
function describedOption(said: string | undefined, index: number): string {
  if (said !== undefined && said !== '') return said;
  return index === 0
    ? 'The closest to the legacy technology, so the smallest change for the team.'
    : 'The other proposal for this layer, derived from the legacy stack.';
}

/** P7-29: the two proposals of a layer: the planner's after the consent, else the catalogue's. */
function proposalsOf(layer: string, sources: OptionSources): QuestionOption[] {
  const found = sources.options?.stack.find((each) => each.layer === layer);
  const offered = found?.options ?? [];
  if (offered.length === 0) {
    const catalogued = sources.offer?.layers.find((each) => each.layer === layer)?.proposals ?? [];
    return catalogued.map((proposal, index) => ({
      id: index === 0 ? 'a' : 'b',
      title: proposal.choice,
      description: proposal.why,
      recommended: index === 0,
    }));
  }
  return offered.map((choice, index) => ({
    id: index === 0 ? 'a' : 'b',
    title: choice,
    description: describedOption(found?.descriptions?.[index], index),
    recommended: index === 0,
  }));
}

/** DEC-203: the catalogue says whether the layer may keep its legacy technology (yes while unknown). */
function stackOptions(layer: string, sources: OptionSources): QuestionOption[] {
  const keep = sources.offer?.layers.find((each) => each.layer === layer)?.keepLegacy ?? true;
  return [
    ...proposalsOf(layer, sources),
    ...(keep ? [fromWording(sources.catalogue.wording.keepLegacy)] : []),
  ];
}

const withDefaultFirst = (options: readonly QuestionOption[]): QuestionOption[] => [
  ...options.filter((option) => option.recommended),
  ...options.filter((option) => !option.recommended),
];

/** The options of one question, the recommended one first (empty for an unknown question). */
export function questionOptions(id: string, sources: OptionSources): QuestionOption[] {
  const { catalogue } = sources;
  if (id === 'principles') return principleOptions(catalogue);
  if (id === 'architecture') return architectureOptions(sources);
  if (id === 'migration') {
    return catalogue.migrations.map((strategy, index) => ({
      id: strategy.id,
      title: strategy.title,
      description: strategy.tradeOff,
      recommended: index === 0,
    }));
  }
  if (id === 'buildMethod') return catalogue.wording.method.map(fromWording);
  const layer = STACK_LAYERS.find((each) => id === `stack.${each.id}`);
  if (layer !== undefined) return withDefaultFirst(stackOptions(layer.id, sources));
  return withDefaultFirst((catalogue.wording.context[id] ?? []).map(fromWording));
}
