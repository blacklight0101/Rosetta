import type { PlanContent } from './plan-content.js';
import type { SourceCard } from './plan-sources.js';
import type { PrdContent } from './prd-content.js';
import type { LegacyScreen } from './target-ux.js';

// RF-627, P5-40: the checks that count what the package claims. Besides the items (plan-coverage.ts),
// checks.md lists a requirement no task card lists, a Must screen dropped only because of the screen
// cap, and a source feature card that no requirement cites. Each answers a question of the owner
// ("is everything the package promises built?"), and none of them makes the run fail on its own.

type Requirement = PlanContent['requirements'][number];

/** The requirements no task card lists, in the order of the plan. */
// RF-627
export function requirementsBuiltByNoCard(content: PlanContent): Requirement[] {
  const listed = new Set(content.tasks.flatMap((task) => task.requirements));
  return content.requirements.filter((requirement) => !listed.has(requirement.id));
}

/**
 * The legacy screens dropped over the cap (Q-27) that a requirement cites together with a source
 * card of a Must feature: the screen is needed by something the package says it must do.
 */
// RF-627
export function mustScreensOverCap(
  legacy: readonly LegacyScreen[],
  prd: PrdContent,
  requirements: readonly Requirement[],
): LegacyScreen[] {
  const must = new Set(
    prd.features.filter((feature) => feature.priority === 'Must').flatMap((each) => each.sources),
  );
  const needed = new Set(
    requirements
      .filter((requirement) => requirement.sources.some((card) => must.has(card)))
      .flatMap((requirement) => requirement.sources),
  );
  return legacy.filter((screen) => screen.overCap === true && needed.has(screen.cardId));
}

/** The supported `FEAT` cards that no requirement cites: the package says nothing of what they found. */
// RF-627
export function sourceCardsWithNoRequirement(
  cards: readonly SourceCard[],
  requirements: readonly Requirement[],
): SourceCard[] {
  const cited = new Set(requirements.flatMap((requirement) => requirement.sources));
  return cards.filter((card) => card.type === 'FEAT' && !cited.has(card.id));
}
