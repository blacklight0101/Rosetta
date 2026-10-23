import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { SourceCard } from './plan-sources.js';
import type { StackLayer } from './planning-brief.js';
import { layerTerms, mentions, stackTechnologies, technologiesNamed } from './stack-catalogue.js';

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

/** The catalogue options for the layer, one line each; the choice is marked, and added if unknown. */
// RF-609
export function stackOptions(layer: StackLayer, choice: string, custom: boolean): string[] {
  const named = new Set(technologiesNamed(layer, choice).map((tech) => tech.name));
  const options = stackTechnologies
    .filter((tech) => tech.layer === layer)
    .map((tech) => `${tech.name}${named.has(tech.name) ? ' (chosen)' : ''}: ${tech.description}`);
  if (named.size > 0) return options;
  const origin = custom
    ? 'typed by the owner; the catalogue does not describe it.'
    : 'the catalogue does not describe it.';
  return [`${choice} (chosen): ${origin}`, ...options];
}

/** The task cards whose title or files name the layer or the chosen technology. */
// RF-609
export function touchingTasks(
  tasks: readonly TaskRef[],
  layer: StackLayer,
  choice: string,
): string[] {
  const terms = [
    ...layerTerms[layer],
    ...technologiesNamed(layer, choice).flatMap((t) => t.aliases),
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
