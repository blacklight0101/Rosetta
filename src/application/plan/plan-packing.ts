import type { SourceCard } from '../../domain/planning/plan-sources.js';

// P3-113, EV-29, RF-604, RF-405: a planner call is packed to the planner model's window. The cards
// are grouped by area; the groups that fit are sent in full, in the order of their size (the
// largest area first), and the cards that do not fit are named in a summary worked out by code
// (id, type and title, by area), so no model call is spent on it and every supported card is still
// named in the prompt and can be cited. The window must hold the prompt, the answer, and the answer
// so far of one continuation (RF-604), less a margin for the difference between the four characters
// per token the budget guard counts and the model's own count.

/** The window of a planner call and the output limit it writes into. */
export interface PlanWindow {
  readonly windowTokens: number;
  readonly maxOutputTokens: number;
}

export interface Packing {
  /** The ids of the cards the prompt names by title only. */
  readonly omitted: ReadonlySet<string>;
  /** The prompt as the budget guard counts it. */
  readonly promptTokens: number;
  /** What the prompt may take; undefined when the planner has no known window. */
  readonly budgetTokens: number | undefined;
  /** False when the prompt is over the budget even with every card named by title only. */
  readonly fits: boolean;
}

const CHARS_PER_TOKEN = 4;
/** The answer, and with a continuation the answer so far and the next one (RF-604). */
const ANSWERS_RESERVED = 2;
/** A share of the window kept back: the model counts tokens its own way. */
const MARGIN_PERCENT = 3;
/** The longest title in the summary of the omitted cards. */
const TITLE_CHARS = 120;
/** From this many omitted cards the summary names the ids only, so it stays small. */
const TITLES_UP_TO = 600;

/** What a prompt may take: the window less the answers and the margin; never below zero. */
export function promptBudgetTokens(window: PlanWindow): number {
  const margin = Math.ceil((window.windowTokens * MARGIN_PERCENT) / 100);
  return Math.max(0, window.windowTokens - ANSWERS_RESERVED * window.maxOutputTokens - margin);
}

/** The omitted cards by area: id, type and (up to a count) title. Empty for none. */
export function omittedSummary(cards: readonly SourceCard[]): string {
  if (cards.length === 0) return '';
  const byArea = new Map<string, SourceCard[]>();
  for (const card of cards) byArea.set(card.area, [...(byArea.get(card.area) ?? []), card]);
  const named = (card: SourceCard): string =>
    cards.length > TITLES_UP_TO
      ? card.id
      : `${card.id} (${card.title.slice(0, TITLE_CHARS).trimEnd()})`;
  const lines = [...byArea].map(
    ([area, inArea]) => `- ${area} (${String(inArea.length)}): ${inArea.map(named).join('; ')}`,
  );
  return [
    `${String(cards.length)} supported cards are not shown in full because the prompt must fit the model's window. They are named here by area, with their ids; they are supported cards too, and may be cited by id.`,
    ...lines,
  ].join('\n');
}

export interface PackRequest {
  readonly window: PlanWindow | undefined;
  /** The system prompt of the call. */
  readonly system: string;
  /** The cards the message shows in full when they fit. */
  readonly cards: readonly SourceCard[];
  /** The user message with these cards named by title only. */
  readonly render: (omitted: ReadonlySet<string>) => string;
}

function tokensOf(request: PackRequest, omitted: ReadonlySet<string>): number {
  return Math.ceil((request.system + request.render(omitted) + '[]').length / CHARS_PER_TOKEN);
}

/** About what a card takes in the message, in characters (pretty-printed JSON). */
function weightOf(card: SourceCard): number {
  const claims = card.claims.map((claim) => claim.text.length + 60 * claim.citations.length + 24);
  return card.id.length + card.title.length + card.summary.length + 90 + sum(claims);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** The cards in the order they are taken: the largest area first, then the area's own order. */
function priorityOf(cards: readonly SourceCard[]): SourceCard[][] {
  const groups = new Map<string, SourceCard[]>();
  for (const card of cards) groups.set(card.area, [...(groups.get(card.area) ?? []), card]);
  return [...groups.values()]
    .map((group, index) => ({ group, index }))
    .sort((a, b) => b.group.length - a.group.length || a.index - b.index)
    .map(({ group }) => group);
}

/** The cards that fit `room` characters: whole areas first-fit, then one area card by card. */
function chosenFor(cards: readonly SourceCard[], room: number): SourceCard[] {
  const chosen: SourceCard[] = [];
  const deferred: SourceCard[][] = [];
  let left = room;
  for (const group of priorityOf(cards)) {
    const weight = sum(group.map(weightOf));
    if (weight <= left) {
      chosen.push(...group);
      left -= weight;
    } else deferred.push(group);
  }
  for (const card of deferred[0] ?? []) {
    if (weightOf(card) > left) continue;
    chosen.push(card);
    left -= weightOf(card);
  }
  return chosen;
}

function omittedOf(cards: readonly SourceCard[], shown: ReadonlySet<string>): Set<string> {
  return new Set(cards.filter((card) => !shown.has(card.id)).map((card) => card.id));
}

// P3-113
export function packCards(request: PackRequest): Packing {
  const { window, cards } = request;
  const none = new Set<string>();
  if (window === undefined) {
    return {
      omitted: none,
      promptTokens: tokensOf(request, none),
      budgetTokens: undefined,
      fits: true,
    };
  }
  const budget = promptBudgetTokens(window);
  const result = (omitted: ReadonlySet<string>, promptTokens: number): Packing => ({
    ...{ omitted, promptTokens, budgetTokens: budget },
    fits: promptTokens <= budget,
  });
  const full = tokensOf(request, none);
  if (full <= budget) return result(none, full);
  const all = omittedOf(cards, new Set());
  const bare = tokensOf(request, all);
  if (bare > budget) return result(all, bare);
  const order = chosenFor(cards, (budget - bare) * CHARS_PER_TOKEN);
  let omitted = omittedOf(cards, new Set(order.map((card) => card.id)));
  let tokens = tokensOf(request, omitted);
  // The weights are a guess: drop the cards taken last until the real message fits.
  while (tokens > budget && order.length > 0) {
    let excess = (tokens - budget) * CHARS_PER_TOKEN;
    do {
      const dropped = order.pop();
      excess -= dropped === undefined ? excess : weightOf(dropped);
    } while (excess > 0 && order.length > 0);
    omitted = omittedOf(cards, new Set(order.map((card) => card.id)));
    tokens = tokensOf(request, omitted);
  }
  return result(omitted, tokens);
}
