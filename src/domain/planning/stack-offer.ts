import { stackLayers, type ApplicationKind, type StackLayer } from './planning-brief.js';
import type { StackData, StackOption } from './stack-data.js';

// P7-29, RF-609, RF-645, DEC-172, DEC-203: what Plan setup offers for each stack layer before the
// planner is asked, from the catalogue alone (no code leaves the machine). The two proposals are the
// first two entries of `stack-proposals.v<n>.yaml` that fit the application kind and the legacy
// languages, the first being the one a layer left open takes (the recommended one). Keeping the
// legacy technology is not offered for an Excel workbook, nor for a layer whose legacy technology the
// catalogue flags `endOfLife`.

const MAX_PROPOSALS = 2;

interface OfferedProposal {
  readonly choice: string;
  readonly why: string;
}

export interface LayerOffer {
  readonly layer: StackLayer;
  /** At most two, the recommended one first; empty when the catalogue has no option for the layer. */
  readonly proposals: readonly OfferedProposal[];
  readonly keepLegacy: boolean;
}

export interface OfferInput {
  readonly kind: ApplicationKind;
  /** The three languages with most lines. */
  readonly languages: readonly string[];
  /** The source is Excel workbooks. */
  readonly workbook: boolean;
}

const fits = (option: StackOption, languages: readonly string[]): boolean =>
  option.legacy.length === 0 || option.legacy.some((id) => languages.includes(id));

/** The catalogue options of a layer for the kind and the languages, in catalogue order, without a repeated choice. */
export function matchingOptions(
  stack: StackData,
  kind: ApplicationKind,
  layer: string,
  languages: readonly string[],
): StackOption[] {
  if (kind === 'keep') return [];
  const found = stack.proposals.options.filter(
    (each) => each.kind === kind && each.layer === layer && fits(each, languages),
  );
  return found.filter((each, index) => found.findIndex((o) => o.choice === each.choice) === index);
}

function endOfLife(stack: StackData, layer: string, languages: readonly string[]): boolean {
  return stack.proposals.legacy.some(
    (each) =>
      each.endOfLife &&
      (each.layers.length === 0 || each.layers.includes(layer)) &&
      each.languages.some((id) => languages.includes(id)),
  );
}

/** One offer for each of the seven layers, in the order of the brief. */
export function stackOfferFor(input: OfferInput, stack: StackData): LayerOffer[] {
  const { kind, languages, workbook } = input;
  return stackLayers.map((layer) => ({
    layer,
    proposals: matchingOptions(stack, kind, layer, languages)
      .slice(0, MAX_PROPOSALS)
      .map((each) => ({ choice: each.choice, why: each.why })),
    keepLegacy: !workbook && !endOfLife(stack, layer, languages),
  }));
}
