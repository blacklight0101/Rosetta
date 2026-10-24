import { normalisedRoute, type CardMerge } from './card-merge.js';
import type { Card } from './card.js';
import { normalisedTitle } from './title-merge.js';

// P5-32, P3-125, RF-250, ADR-005: merges that need no model. Screen cards that describe one page
// (one route inside an area, or the file the page is made of) become one card, and cards of one
// type with one normalised title in several areas become one card when their claims cite a file
// in common or name the same external system. Otherwise they stay apart: two cards with one title
// about different files are two subjects. The merge itself is `applyMerges`, which keeps every
// distinct claim with its status and verdict, so a rejected claim stays rejected.

/** Types the cross-area merge leaves alone: journeys, and screens (the page merge handles them). */
const NOT_ACROSS_AREAS = ['FLOW', 'SCRN'];

/** Host names of the systems an organisation runs for itself, which a claim may name without a scheme. */
const HOST_SUFFIXES = ['com', 'net', 'org', 'io', 'test', 'local', 'lan', 'corp', 'internal'];
const SCHEME_HOST = /\bhttps?:\/\/([a-z0-9.-]+)/giu;
const DOTTED_HOST = /\b((?:[a-z0-9-]+\.){2,}[a-z]+)\b/giu;

function mergeOf(cards: readonly Card[]): CardMerge | undefined {
  const [first] = cards;
  if (first === undefined || cards.length < 2) return undefined;
  return { ids: cards.map((card) => card.id), title: first.title, summary: first.summary };
}

function paths(card: Card): ReadonlySet<string> {
  return new Set(card.claims.flatMap((claim) => claim.citations.map((each) => each.path)));
}

/** The file most of the card's citations are in; the first cited one when it is a tie. */
function pageFile(card: Card): string | undefined {
  const counts = new Map<string, number>();
  for (const claim of card.claims) {
    for (const { path } of claim.citations) counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  let best: string | undefined;
  for (const [path, count] of counts) {
    if (best === undefined || count > (counts.get(best) ?? 0)) best = path;
  }
  return best;
}

function routeOf(card: Card): string {
  return card.screen === undefined ? '' : normalisedRoute(card.screen.route);
}

function areasOf(card: Card): readonly string[] {
  return card.mergedAreas ?? [card.area];
}

interface Page {
  route: string;
  readonly members: Card[];
}

function joins(page: Page, card: Card): boolean {
  const route = routeOf(card);
  // P5-12: two screens at two routes are two screens, whoever proposes the merge.
  if (route !== '' && page.route !== '' && route !== page.route) return false;
  const file = pageFile(card);
  const sameFile = page.members.some((member) => {
    const memberFile = pageFile(member);
    return file !== undefined && memberFile === file;
  });
  const sameRoute =
    route !== '' &&
    route === page.route &&
    page.members.some((member) => member.area === card.area);
  return sameFile || sameRoute;
}

/** Screen cards of one page: one route within an area, or one page file; in card order. */
// P5-32
export function pageMerges(cards: readonly Card[]): readonly CardMerge[] {
  const pages: Page[] = [];
  for (const card of cards.filter((each) => each.type === 'SCRN')) {
    const page = pages.find((each) => joins(each, card));
    if (page === undefined) {
      pages.push({ route: routeOf(card), members: [card] });
      continue;
    }
    page.members.push(card);
    if (page.route === '') page.route = routeOf(card);
  }
  return pages.flatMap((page) => mergeOf(page.members) ?? []);
}

function hostsOf(card: Card): ReadonlySet<string> {
  const hosts = new Set<string>();
  for (const { text } of card.claims) {
    for (const match of text.matchAll(SCHEME_HOST)) hosts.add((match[1] ?? '').toLowerCase());
    for (const match of text.matchAll(DOTTED_HOST)) {
      const host = (match[1] ?? '').toLowerCase();
      if (HOST_SUFFIXES.includes(host.split('.').at(-1) ?? '')) hosts.add(host);
    }
  }
  hosts.delete('');
  return hosts;
}

function shares(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return [...left].some((item) => right.has(item));
}

/**
 * Whether two cards of one type and title are about the same thing: they cite a file in common, they
 * name the same external host, or they are integrations (the title of an integration names its
 * system, so the title match is the system match).
 */
function related(left: Card, right: Card): boolean {
  if (left.type === 'INT') return true;
  return shares(paths(left), paths(right)) || shares(hostsOf(left), hostsOf(right));
}

/** The groups of related cards among cards of one type and title, each in card order. */
function clusters(group: readonly Card[]): Card[][] {
  const found: Card[][] = [];
  for (const card of group) {
    const linked = found.filter((each) => each.some((member) => related(member, card)));
    const joined = [...linked.flat(), card];
    for (const each of linked) found.splice(found.indexOf(each), 1);
    found.push(group.filter((member) => joined.includes(member)));
  }
  return found;
}

/** Same type and title in two areas or more, with a shared file or external system; card order. */
// P5-32
export function crossAreaMerges(cards: readonly Card[]): readonly CardMerge[] {
  const groups = new Map<string, Card[]>();
  for (const card of cards.filter((each) => !NOT_ACROSS_AREAS.includes(each.type))) {
    const key = `${card.type} ${normalisedTitle(card.title)}`;
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }
  return [...groups.values()]
    .flatMap((group) => clusters(group))
    .filter((cluster) => new Set(cluster.flatMap(areasOf)).size >= 2)
    .flatMap((cluster) => mergeOf(cluster) ?? []);
}
