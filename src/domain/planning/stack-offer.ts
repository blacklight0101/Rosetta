import { stackLayers, type ApplicationKind, type StackLayer } from './planning-brief.js';
import { vagueMatch } from './vague-choice.js';
import type { StackData, StackOption, VagueWords } from './stack-data.js';

// P7-29, RF-609, RF-645, DEC-172, DEC-203: what Plan setup offers for each stack layer before the
// planner is asked, from the catalogue alone (no code leaves the machine). The two proposals are the
// first two entries of `stack-proposals.v<n>.yaml` that fit the application kind and the legacy
// languages, the first being the one a layer left open takes (the recommended one). Keeping the
// legacy technology is not offered for an Excel workbook, nor for a layer whose legacy technology the
// catalogue flags `endOfLife`.

const MAX_PROPOSALS = 2;
const MAX_PLATFORM_CHOICES = 4;

interface OfferedProposal {
  readonly choice: string;
  readonly why: string;
}

export interface LayerOffer {
  readonly layer: StackLayer;
  /** At most two, the recommended one first; empty when the catalogue has no option for the layer. */
  readonly proposals: readonly OfferedProposal[];
  readonly keepLegacy: boolean;
  /** P7-30: for each group of vague words, the layer's options for that platform, the recommended first. */
  readonly vague: readonly {
    readonly words: readonly string[];
    readonly proposals: readonly OfferedProposal[];
  }[];
}

export interface OfferInput {
  readonly kind: ApplicationKind;
  /** The three languages with most lines. */
  readonly languages: readonly string[];
  /** Every file extension of the code map (see `LegacyFacts`). */
  readonly extensions: readonly string[];
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

/** P7-30: the catalogue's options of the layer for a platform, the recommended one first. */
export function platformOptions(
  stack: StackData,
  want: { kind: ApplicationKind; layer: string; platform: VagueWords; scanned: readonly string[] },
): StackOption[] {
  const { kind, layer, platform, scanned } = want;
  const languages = platform.languages.length === 0 ? scanned : platform.languages;
  return matchingOptions(stack, kind, layer, languages);
}

function endOfLife(stack: StackData, layer: string, input: OfferInput): boolean {
  return stack.proposals.legacy.some(
    (each) =>
      each.endOfLife &&
      (each.layers.length === 0 || each.layers.includes(layer)) &&
      (each.languages.some((id) => input.languages.includes(id)) ||
        each.extensions.some((extension) => input.extensions.includes(extension))),
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
    keepLegacy: !workbook && !endOfLife(stack, layer, input),
    vague: stack.proposals.vague
      .map((each) => ({
        // A word that names a technology of the layer (".net" for the language) is specific there.
        words: each.words.filter((word) => vagueMatch(stack, layer, word) !== undefined),
        proposals: platformOptions(stack, { kind, layer, platform: each, scanned: languages })
          .slice(0, MAX_PLATFORM_CHOICES)
          .map((option) => ({ choice: option.choice, why: option.why })),
      }))
      .filter((each) => each.words.length > 0 && each.proposals.length > 0),
  }));
}
