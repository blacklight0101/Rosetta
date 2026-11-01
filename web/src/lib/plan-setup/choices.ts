import type { Catalogue, PlanOptions } from '../../api/plan-schemas.js';
import { isAnswered, withAnswered, type Draft } from './draft.js';
import { TYPED } from './own-answers.js';
import { STACK_LAYERS, STYLE_GROUP } from './steps.js';

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
  const next = { ...draft, style, recommended: proposedOf(options), evidence };
  return withAnswered(chosen(next, 'architecture', style), ['architecture']);
}

/**
 * RF-609: the draft with a technology chosen for a layer; an empty choice takes the layer back.
 * `offered` is what the page showed for the layer, kept so the stack record can list it.
 */
export function chooseLayer(
  draft: Draft,
  layer: string,
  pick: {
    readonly choice: string;
    readonly custom: boolean;
    readonly offered?: readonly string[];
    /** RF-645: the id of the option picked; a typed choice needs none. */
    readonly option?: string;
  },
): Draft {
  const { choice, custom, offered = [] } = pick;
  const others = Object.fromEntries(Object.entries(draft.stack).filter(([key]) => key !== layer));
  const marked = chosen(draft, `stack.${layer}`, custom ? TYPED : (pick.option ?? ''));
  if (choice.trim() === '') return { ...marked, stack: others };
  const entry = { layer, choice, custom, ...(offered.length === 0 ? {} : { offered }) };
  return withAnswered({ ...marked, stack: { ...others, [layer]: entry } }, [`stack.${layer}`]);
}

/**
 * P7-29: after the consent a layer the person left unanswered takes the planner's recommended
 * option, the first of its options. Without the planner's options the draft is returned as it is and
 * the server takes the catalogue's recommendation for the layer.
 */
export function acceptedStack(draft: Draft, options: PlanOptions | undefined): Draft {
  return STACK_LAYERS.reduce((next, { id }) => {
    const offered = options?.stack.find((each) => each.layer === id)?.options ?? [];
    const [first] = offered;
    const question = `stack.${id}`;
    if (first === undefined || isAnswered(next, question) || next.chosen[question] === TYPED) {
      return next;
    }
    return chooseLayer(next, id, { choice: first, custom: false, offered, option: 'a' });
  }, draft);
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

/** RF-645: the draft with the option that answers a question recorded; an empty id clears it. */
export function chosen(draft: Draft, question: string, option: string): Draft {
  const rest = Object.fromEntries(Object.entries(draft.chosen).filter(([id]) => id !== question));
  return { ...draft, chosen: option === '' ? rest : { ...rest, [question]: option } };
}

/**
 * RF-645: the draft with a question answered by typing; an empty text keeps the choice but sends
 * nothing. The typed text does not answer the question's own field: the server keeps the enumerated
 * default value and sends the text to the planner as the owner's own answer (DEC-184).
 */
export function typeOwn(draft: Draft, question: string, text: string): Draft {
  return { ...chosen(draft, question, TYPED), typed: { ...draft.typed, [question]: text } };
}

/** RF-645: an option picked for a question that has no field of its own for a typed answer. */
export function chooseOption(draft: Draft, question: string, option: string): Draft {
  return withAnswered(chosen(draft, question, option), [question]);
}

/** RF-645: a typed principle beside the toggles; an empty text takes the typed answer back. */
export function typePrinciple(draft: Draft, text: string): Draft {
  if (text.trim() === '') {
    const typed = Object.fromEntries(
      Object.entries(draft.typed).filter(([id]) => id !== 'principles'),
    );
    return { ...chosen(draft, 'principles', ''), typed };
  }
  return typeOwn(draft, 'principles', text);
}

/** EV-73: a typed architecture answer keeps Rosetta's proposal; not implemented yet. */
export function keepProposed(draft: Draft, options: PlanOptions | undefined): Draft {
  return options === undefined ? draft : { ...draft };
}
