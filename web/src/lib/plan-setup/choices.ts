import type { Catalogue, PlanOptions } from '../../api/plan-schemas.js';
import { withAnswered, type Draft } from './draft.js';
import { STYLE_GROUP } from './steps.js';

// RF-605, RF-608, RF-609: how a click on the page changes the draft. A choice records the question
// as answered, so a save sends it; a question never touched keeps its default (DEC-80).

/** The architecture styles of the catalogue, in catalogue order. */
export const stylesOf = (catalogue: Catalogue): Catalogue['entries'] =>
  catalogue.entries.filter((entry) => entry.group === STYLE_GROUP);

/** The styles the planner proposed, in its order; empty while the options are unknown. */
export function proposedOf(options: PlanOptions | undefined): readonly string[] {
  return options?.architecture.options.map((option) => option.style) ?? [];
}

/** RF-608: the style shown as chosen: the person's choice, else the one the planner recommends. */
export function shownStyle(
  draft: Draft,
  options: PlanOptions | undefined,
  answered: boolean,
): string {
  return answered ? draft.style : (options?.architecture.recommended ?? draft.style);
}

/** RF-608: the draft with a style chosen, the styles proposed and the card ids behind the choice. */
export function chooseStyle(draft: Draft, options: PlanOptions | undefined, style: string): Draft {
  const evidence =
    options?.architecture.options.find((option) => option.style === style)?.evidence ?? [];
  return withAnswered({ ...draft, style, recommended: proposedOf(options), evidence }, [
    'architecture',
  ]);
}

/** RF-609: the draft with a technology chosen for a layer; an empty choice takes the layer back. */
export function chooseLayer(draft: Draft, layer: string, choice: string, custom: boolean): Draft {
  const others = Object.fromEntries(Object.entries(draft.stack).filter(([key]) => key !== layer));
  if (choice.trim() === '') return { ...draft, stack: others };
  return withAnswered({ ...draft, stack: { ...others, [layer]: { layer, choice, custom } } }, [
    `stack.${layer}`,
  ]);
}

/** The principles kept, in catalogue order. */
export function togglePrinciple(
  draft: Draft,
  catalogue: Catalogue,
  id: string,
  on: boolean,
): Draft {
  const kept = new Set(on ? [...draft.principles, id] : draft.principles.filter((p) => p !== id));
  const principles = catalogue.entries.map((entry) => entry.id).filter((each) => kept.has(each));
  return withAnswered({ ...draft, principles }, ['principles']);
}
