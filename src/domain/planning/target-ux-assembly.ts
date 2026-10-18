import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { SourceCard } from './plan-sources.js';
import {
  MAX_SCREENS,
  noDesignBrief,
  type DesignBriefContent,
  type LegacyScreen,
  type NavigationLink,
  type TargetScreen,
  type UxAssembly,
  type UxDraft,
  type UxLeftOut,
  type WireframeAction,
  type WireframeField,
} from './target-ux.js';

// RF-626, Q-27: the planner's draft made into the target screens. Every verified `SCRN` card ends
// up kept (alone in a screen), merged (with others in a screen) or dropped, each with a reason: a
// card the planner said nothing usable about is dropped by the code, with a reason that says so, so
// nothing is silently lost. What a wireframe lists (roles, fields, actions, where it leads) is
// taken from the legacy cards of the screen; the draft only names the screen and says why.

const unlistedReason =
  'The planner neither kept, merged nor dropped this screen; confirm whether the new system needs it.';
const noReason = 'The planner gave no reason for this decision; confirm it.';
const overCapReason = `More than ${String(MAX_SCREENS)} screens were planned; this one is over the cap (Q-27).`;
/** The most components a design brief lists. */
const MAX_COMPONENTS = 20;

/** Where one legacy card ended up; `target` is the id of its target screen, null when dropped. */
interface Placement {
  readonly reason: string;
  readonly target: string | null;
}

/** A target screen the draft asked for, its cards checked and in id order. */
interface Group {
  readonly name: string;
  readonly purpose: string;
  readonly reason: string;
  readonly cards: readonly string[];
}

interface Placed {
  readonly groups: readonly Group[];
  /** The cards the planner dropped or that are over the cap. */
  readonly dropped: ReadonlyMap<string, Placement>;
  readonly leftOut: UxLeftOut;
}

/** Says whether a card id may be placed now: a verified card nobody placed before. */
function claimer(known: ReadonlySet<string>): (id: string) => boolean {
  const claimed = new Set<string>();
  return (id) => {
    if (!known.has(id) || claimed.has(id)) return false;
    claimed.add(id);
    return true;
  };
}

/** The target screens of the draft, in draft order, up to the cap; the rest are dropped. */
function placeScreens(
  entries: UxDraft['screens'],
  claim: (id: string) => boolean,
  into: {
    groups: Group[];
    dropped: Map<string, Placement>;
    refused: { screens: number; cards: number };
  },
): void {
  for (const entry of entries) {
    const ids = entry.cards.filter(claim).toSorted(byCodeUnit);
    into.refused.cards += entry.cards.length - ids.length;
    if (ids.length === 0) into.refused.screens += 1;
    else if (into.groups.length < MAX_SCREENS) {
      into.groups.push({ ...entry, reason: entry.reason.trim() || noReason, cards: ids });
    } else for (const id of ids) into.dropped.set(id, { reason: overCapReason, target: null });
  }
}

/** The target screens of the draft, the cards it dropped, and what the checks refused. */
function placeCards(draft: UxDraft | undefined, cards: readonly SourceCard[]): Placed {
  const claim = claimer(new Set(cards.map((card) => card.id)));
  const into = {
    groups: [],
    dropped: new Map<string, Placement>(),
    refused: { screens: 0, cards: 0 },
  };
  placeScreens(draft?.screens ?? [], claim, into);
  for (const { card, reason } of draft?.dropped ?? []) {
    if (claim(card)) into.dropped.set(card, { reason: reason.trim() || noReason, target: null });
    else into.refused.cards += 1;
  }
  return { groups: into.groups, dropped: into.dropped, leftOut: into.refused };
}

function addUnique<T>(items: T[], seen: Set<string>, item: T, key: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  items.push(item);
}

/** The fields of these cards, a field of the same name once, required if any card requires it. */
function fieldsOf(cards: readonly SourceCard[]): WireframeField[] {
  const fields = new Map<string, WireframeField>();
  for (const field of cards.flatMap((card) => card.screen?.fields ?? [])) {
    const known = fields.get(field.name);
    const required = (known?.required ?? false) || field.required;
    fields.set(field.name, { ...(known ?? field), required });
  }
  return [...fields.values()];
}

function actionsOf(cards: readonly SourceCard[]): WireframeAction[] {
  const actions: WireframeAction[] = [];
  const seen = new Set<string>();
  for (const { label, handler = null, flow = null } of cards.flatMap(
    (card) => card.screen?.actions ?? [],
  )) {
    addUnique(actions, seen, { label, handler, flow }, JSON.stringify([label, handler, flow]));
  }
  return actions;
}

/** What `linkOf` needs to know about every legacy card. */
interface Context {
  readonly cards: ReadonlyMap<string, SourceCard>;
  /** The first card with each route. */
  readonly routes: ReadonlyMap<string, string>;
  readonly placements: ReadonlyMap<string, Placement>;
  /** The name of each target screen by its id. */
  readonly names: ReadonlyMap<string, string>;
}

/** Where a `leadsTo` entry goes now; undefined for the screen it is on. */
function linkOf(ref: string, own: string, context: Context): NavigationLink | undefined {
  const cardId = context.cards.has(ref) ? ref : context.routes.get(ref);
  if (cardId === undefined) return { label: ref, screenId: null };
  const target = context.placements.get(cardId)?.target ?? null;
  if (target === null) return { label: `${ref} (dropped legacy screen)`, screenId: null };
  if (target === own) return undefined;
  return { label: context.names.get(target) ?? target, screenId: target };
}

function navigationOf(
  cards: readonly SourceCard[],
  own: string,
  context: Context,
): NavigationLink[] {
  const links: NavigationLink[] = [];
  const seen = new Set<string>();
  for (const ref of cards.flatMap((card) => card.screen?.leadsTo ?? [])) {
    const link = linkOf(ref, own, context);
    if (link === undefined) continue;
    addUnique(links, seen, link, JSON.stringify([link.label, link.screenId]));
  }
  return links;
}

function screenOf(group: Group, context: Context): TargetScreen {
  const cards = group.cards.flatMap((id) => context.cards.get(id) ?? []);
  const id = group.cards[0] ?? '';
  const roles = [...new Set(cards.flatMap((card) => card.screen?.roles ?? []))];
  return {
    ...{ id, name: context.names.get(id) ?? id, purpose: group.purpose.trim() },
    ...{ reason: group.reason, cards: group.cards, roles: roles.toSorted(byCodeUnit) },
    fields: fieldsOf(cards),
    uncheckedFields: [],
    fieldsNotConfirmed: false,
    actions: actionsOf(cards),
    navigation: navigationOf(cards, id, context),
  };
}

/** The design brief of the draft, trimmed, with blank components left out and the rest bounded. */
function briefOf(draft: UxDraft | undefined): DesignBriefContent {
  if (draft === undefined) return noDesignBrief;
  const { audience, tone, components } = draft.designBrief;
  return {
    audience: audience.trim(),
    tone: tone.trim(),
    components: components
      .map((component) => component.trim())
      .filter((component) => component !== '')
      .slice(0, MAX_COMPONENTS),
  };
}

/** The name of a target screen: the planner's, else the route or the title of its first card. */
function nameOf(group: Group, first: SourceCard | undefined): string {
  const named = [group.name.trim(), first?.screen?.route ?? '', first?.title ?? ''];
  return named.find((name) => name !== '') ?? '';
}

function routesOf(cards: readonly SourceCard[]): Map<string, string> {
  const routes = new Map<string, string>();
  for (const card of cards) {
    const route = card.screen?.route ?? '';
    if (route !== '' && !routes.has(route)) routes.set(route, card.id);
  }
  return routes;
}

function dispositionOf(target: string | null, size: number): LegacyScreen['disposition'] {
  if (target === null) return 'dropped';
  return size > 1 ? 'merged' : 'kept';
}

function legacyOf(
  cards: readonly SourceCard[],
  placements: ReadonlyMap<string, Placement>,
  sizes: ReadonlyMap<string, number>,
): LegacyScreen[] {
  return cards.map((card) => {
    const { reason, target } = placements.get(card.id) ?? { reason: unlistedReason, target: null };
    const disposition = dispositionOf(target, sizes.get(target ?? '') ?? 0);
    return {
      ...{ cardId: card.id, title: card.title, route: card.screen?.route ?? '' },
      ...{ disposition, reason, target },
    };
  });
}

/**
 * The target screens for these verified `SCRN` cards. Every card is listed in `legacy`, in card
 * order; the screens are in the order of their first card.
 */
// RF-626
export function assembleUx(draft: UxDraft | undefined, cards: readonly SourceCard[]): UxAssembly {
  const { groups, dropped, leftOut } = placeCards(draft, cards);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const placements = new Map(dropped);
  const names = new Map<string, string>();
  for (const group of groups) {
    const id = group.cards[0] ?? '';
    names.set(id, nameOf(group, byId.get(id)));
    for (const card of group.cards) placements.set(card, { reason: group.reason, target: id });
  }
  const context: Context = { cards: byId, routes: routesOf(cards), placements, names };
  const screens = groups
    .map((group) => screenOf(group, context))
    .toSorted((left, right) => byCodeUnit(left.id, right.id));
  const sizes = new Map(screens.map((screen) => [screen.id, screen.cards.length]));
  const legacy = legacyOf(cards, placements, sizes);
  return { ux: { screens, legacy, designBrief: briefOf(draft) }, leftOut };
}
