import type { PlanContent } from './plan-content.js';
import type { RequirementNote } from './requirement-notes.js';
import type { Sources } from './requirement-alignment.js';

// P7-14, RF-607, RF-627, ADR-018: the requirements of a gap card. Under SDD a card names the
// requirements it implements, but a model writes `"requirements": []` for a card whose item no
// requirement cites (Haiku Invoice plan 8ff8e480). Before the card is refused its requirements are
// taken from what it builds: every requirement that cites a source card behind one of its items.
// When its items have source cards but no requirement cites one, the card is kept without a
// requirement and each item is noted for checks.md as one that needs a requirement. Only a card
// whose items have no source card at all, so nothing to derive, is refused.

export interface GapRequirements {
  readonly requirements: readonly string[];
  /** Requirements code put on the card from what it builds. */
  readonly derived: readonly string[];
  /** Items the card builds that no requirement covers; the card is kept without a requirement. */
  readonly unbacked: readonly string[];
}

/** The requirements of the card, or undefined when the plan is SDD and none can be found. */
// P7-14, RF-607
export function gapRequirements(
  content: PlanContent,
  listed: readonly string[],
  builds: readonly string[],
  options: { readonly specificationDriven?: boolean; readonly itemSources?: Sources },
): GapRequirements | undefined {
  const as = { requirements: listed, derived: [], unbacked: [] };
  if (options.specificationDriven !== true || listed.length > 0) return as;
  const behind = new Set(builds.flatMap((id) => [...(options.itemSources?.get(id) ?? [])]));
  if (behind.size === 0) return undefined;
  const derived = content.requirements
    .filter((each) => each.sources.some((card) => behind.has(card)))
    .map((each) => each.id);
  if (derived.length > 0) return { requirements: derived, derived, unbacked: [] };
  return { requirements: [], derived: [], unbacked: builds };
}

/** P7-15: the requirements that cite any of the source cards the answer wrote as requirements. */
export function citingRequirements(content: PlanContent, cards: readonly string[]): string[] {
  const named = new Set(cards);
  return content.requirements
    .filter((each) => each.sources.some((card) => named.has(card)))
    .map((each) => each.id);
}

/** The notes for checks.md about the requirements code gave a gap card, once it has its id. */
export function gapRequirementNotes(task: string, found: GapRequirements): RequirementNote[] {
  return [
    ...found.derived.map((requirement): RequirementNote => ({ kind: 'added', task, requirement })),
    ...found.unbacked.map((item): RequirementNote => ({ kind: 'unbacked', task, item })),
  ];
}
