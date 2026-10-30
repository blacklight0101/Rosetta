import {
  isLocalTier,
  localModelCeiling,
  modelForTier,
  modelTiers,
  resolveBuildMethod,
} from '../../domain/planning/build-method.js';
import type { BuildMethod } from '../../domain/planning/build-method.js';
import { bandsFor, type DifficultyBand } from '../../domain/planning/task-method.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import type { SectionWriter } from './handoff-orchestration-gates-markdown.js';

// RF-640, RF-641, DEC-185, P7-12: the band table of orchestration.md. The bands come from `bandsFor`,
// so a tier whose model runs locally stops at the local ceiling and the next tier takes the cards
// above it; the table and a sentence under it say which tier runs locally, also when no card is in
// that tier. Model names come from the brief and go through the escaper; the rest is fixed text.

type Tier = DifficultyBand['tier'];

const notNamed = 'not named';

function modelOf(method: BuildMethod, tier: Tier, esc: MarkdownEscaper): string {
  const model = modelForTier(method, tier);
  return model === undefined ? notNamed : esc.inline(model);
}

/** The model cell of a builder or a verifier: the name, and `runs locally` when the tier is marked local (RF-641). */
function builderCell(method: BuildMethod, tier: Tier, esc: MarkdownEscaper): string {
  const model = modelOf(method, tier, esc);
  return isLocalTier(method, tier) ? `${model}, runs locally` : model;
}

function verifierTier(band: DifficultyBand): Tier {
  return band.tier === 'largest' ? 'largest' : 'middle';
}

/** One sentence for each tier that runs locally; none when no tier does. */
function localLines(method: BuildMethod, bands: readonly DifficultyBand[]): string[] {
  const lines = modelTiers
    .filter((tier) => isLocalTier(method, tier))
    .map((tier) => {
      const own = `The ${tier} tier model runs locally`;
      if (!bands.some((band) => band.tier === tier))
        return `${own} and takes no card: its cards go to the next tier.`;
      if (tier === 'largest')
        return `${own}; no tier is above it, so it keeps its band, and the package check lists each card above difficulty ${String(localModelCeiling)} on it.`;
      return `${own}, so its band stops at difficulty ${String(localModelCeiling)} (a local model builds only scripted cards); a card above it goes to the next tier.`;
    });
  return lines.length === 0 ? [] : [...lines, ''];
}

// RF-640, RF-641
export const bandsSection: SectionWriter = (handoff, esc) => {
  const method = resolveBuildMethod(handoff.brief.buildMethod);
  const escalation = method.models?.escalation;
  const bands = bandsFor(method);
  return [
    '## Bands and models',
    '',
    'The difficulty of a card (1 to 10) selects the tier that builds it and the tier that verifies it. A card with a risk class other than `none` is built by at least the middle tier. When in doubt between two bands, take the higher one.',
    '',
    '| Difficulty | Builder tier | Builder model | Verifier tier | Verifier model |',
    '| ---------- | ------------ | ------------- | ------------- | -------------- |',
    ...bands.map((band) => {
      const verifier = verifierTier(band);
      return `| ${String(band.from)} to ${String(band.to)} | ${band.tier} | ${builderCell(method, band.tier, esc)} | ${verifier} | ${builderCell(method, verifier, esc)} |`;
    }),
    '',
    ...localLines(method, bands),
    escalation === undefined
      ? 'No escalation model is named: when a card fails a third time, the owner decides what happens next.'
      : `The escalation model is ${esc.inline(escalation)}. It is used only with the owner's approval in chat, for a third attempt at a card; no card starts there.`,
    '',
  ];
};
