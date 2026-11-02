import { byCodeUnit } from '../code-map/code-unit-order.js';
import { splitOption } from './plan-options.js';
import type { SourceCard } from './plan-sources.js';
import type { StackLayer } from './planning-brief.js';
import { layerTerms, mentions, technologiesNamed } from './stack-catalogue.js';
import type { StackTechnology } from './stack-data.js';

// RF-609: what a stack decision record states besides the choice. Everything here is computed from
// the source cards, the task cards and the technology table; no model writes any of it. A card
// "describes the legacy layer" when its title, summary or a claim names one of the layer's terms as
// a whole word (a screen card also describes the front end).

const MAX_SOURCES = 8;
const MAX_TITLE_CHARS = 60;

interface TaskRef {
  readonly id: string;
  readonly title: string;
  readonly files: readonly string[];
}

function cardText(card: SourceCard): string {
  return [card.title, card.summary, ...card.claims.map((claim) => claim.text)].join('\n');
}

function describes(card: SourceCard, layer: StackLayer): boolean {
  if (layer === 'front-end' && card.type === 'SCRN') return true;
  const text = cardText(card);
  return layerTerms[layer].some((term) => mentions(text, term));
}

/** The cards that describe the legacy layer, by id, at most eight. */
// RF-609
export function describingCards(cards: readonly SourceCard[], layer: StackLayer): SourceCard[] {
  return cards
    .filter((card) => describes(card, layer))
    .sort((a, b) => byCodeUnit(a.id, b.id))
    .slice(0, MAX_SOURCES);
}

/** The context of a stack record: what the source cards say of the legacy layer, or that none does. */
// RF-609
export function stackContext(
  name: string,
  layer: StackLayer,
  cards: readonly SourceCard[],
): string {
  const head = `The new system needs a technology for the ${name} layer.`;
  const found = describingCards(cards, layer);
  if (found.length === 0) return `${head} No source card describes the legacy ${name}.`;
  const list = found.map((card) => `${card.id} (${card.title.slice(0, MAX_TITLE_CHARS)})`);
  return `${head} The source cards that describe the legacy ${name} are ${list.join(', ')}; the choice below is made knowing what they say.`;
}

/** EV-65: an offer saved as one long line ("name - reason") is the same option as its name; a typed line is never cut. */
function sameOption(left: string, right: string): boolean {
  const same = left.trim().toLowerCase() === right.trim().toLowerCase();
  return same || splitOption(left).name.toLowerCase() === right.trim().toLowerCase();
}

/**
 * The options the owner was offered for the layer (recorded with the brief), one line each with the
 * description of the technology the catalogue knows it as; the choice is marked, and a typed choice
 * is added. A brief that recorded no offer says so instead of listing a fixed table.
 */
// RF-609
export function stackOptions(
  technologies: readonly StackTechnology[],
  entry: {
    readonly layer: StackLayer;
    readonly choice: string;
    readonly offered?: readonly string[] | undefined;
  },
): string[] {
  const { layer, choice } = entry;
  const offered = entry.offered ?? [];
  if (offered.length === 0) {
    return [`${choice} (chosen): the options Rosetta offered were not recorded for this brief.`];
  }
  // P7-29: the first option offered is the recommended one; the record says so beside the choice.
  const lines = offered.map((option, index) => {
    const mark = sameOption(option, choice) ? ' (chosen)' : '';
    const { name, description } = splitOption(option);
    const known = technologiesNamed(technologies, layer, name)[0];
    const said = known?.description ?? (description === '' ? undefined : description);
    const first = index === 0 ? ' This was the recommended option.' : '';
    return `${name}${mark}: ${said ?? 'Offered by Rosetta; the catalogue has no further description of it.'}${first}`;
  });
  return offered.some((option) => sameOption(option, choice))
    ? lines
    : [`${choice} (chosen): typed by the owner instead of one of the options offered.`, ...lines];
}

/** The task cards whose title or files name the layer or the chosen technology. */
// RF-609
export function touchingTasks(
  tasks: readonly TaskRef[],
  technologies: readonly StackTechnology[],
  entry: { readonly layer: StackLayer; readonly choice: string },
): string[] {
  const { layer, choice } = entry;
  const terms = [
    ...layerTerms[layer],
    ...technologiesNamed(technologies, layer, choice).flatMap((t) => t.aliases),
  ];
  return tasks
    .filter((task) => {
      const text = [task.title, ...task.files].join('\n');
      return terms.some((term) => mentions(text, term));
    })
    .map((task) => task.id)
    .sort(byCodeUnit);
}

/** The consequences of a stack record: the task cards that touch the layer, or that none does yet. */
// RF-609
export function stackConsequences(
  name: string,
  choice: string,
  touching: readonly string[],
): string {
  const rule = `changing the choice means changing this record first.`;
  if (touching.length === 0) {
    return `No task card names the ${name} layer in its title or files; a card that does must use ${choice}, and ${rule}`;
  }
  return `The task cards that touch the ${name} layer are ${touching.join(', ')}; each uses ${choice}, and ${rule}`;
}
