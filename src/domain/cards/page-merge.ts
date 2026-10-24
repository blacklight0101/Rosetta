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

/** A URL with a scheme, as far as the next space or quote; the only place a host is read from. */
const URL_IN_TEXT = /(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/giu;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/u;
const PRIVATE_V4 = [/^127\./u, /^10\./u, /^192\.168\./u, /^172\.(?:1[6-9]|2\d|3[01])\./u];
const LOCAL_V4 = [...PRIVATE_V4, /^0\./u, /^169\.254\./u];

function mergeOf(cards: readonly Card[]): CardMerge | undefined {
  const [first] = cards;
  if (first === undefined || cards.length < 2) return undefined;
  return { ids: cards.map((card) => card.id), title: first.title, summary: first.summary };
}

function paths(card: Card): ReadonlySet<string> {
  return new Set(card.claims.flatMap((claim) => claim.citations.map((each) => each.path)));
}

function routeOf(card: Card): string {
  return card.screen === undefined ? '' : normalisedRoute(card.screen.route);
}

function areasOf(card: Card): readonly string[] {
  return card.mergedAreas ?? [card.area];
}

/**
 * The files cited by screen cards of two or more routes: a layout, a master page, a partial. Such a
 * file says nothing about which page a card is about, so it is never page identity (P5-32). The
 * kinds of file are not guessed; the evidence is who cites the file.
 */
function sharedFiles(screens: readonly Card[]): ReadonlySet<string> {
  const routes = new Map<string, Set<string>>();
  for (const card of screens) {
    const route = routeOf(card);
    if (route === '') continue;
    for (const path of paths(card)) routes.set(path, (routes.get(path) ?? new Set()).add(route));
  }
  return new Set([...routes].filter(([, each]) => each.size >= 2).map(([path]) => path));
}

/** The files a card cites without the shared ones, and the one it cites most (first on a tie). */
function pageIdentity(card: Card, shared: ReadonlySet<string>) {
  const counts = new Map<string, number>();
  for (const claim of card.claims) {
    for (const { path } of claim.citations) {
      if (!shared.has(path)) counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  let top: string | undefined;
  for (const [path, count] of counts)
    if (top === undefined || count > (counts.get(top) ?? 0)) top = path;
  return { files: new Set(counts.keys()), top };
}

type Identity = ReturnType<typeof pageIdentity>;

/** A card with no route is the same page when its files are all the other's and the other's page file is among them. */
function coversPage(small: Identity, big: Identity): boolean {
  if (small.files.size === 0 || big.top === undefined) return false;
  return [...small.files].every((path) => big.files.has(path)) && small.files.has(big.top);
}

function samePage(left: Card, right: Card, shared: ReadonlySet<string>): boolean {
  const [one, other] = [routeOf(left), routeOf(right)];
  // P5-12: two screens at two routes are two screens, whoever proposes the merge.
  if (one !== '' && other !== '' && one !== other) return false;
  if (one !== '' && other !== '') return left.area === right.area;
  const [a, b] = [pageIdentity(left, shared), pageIdentity(right, shared)];
  if (one === '' && other === '') return coversPage(a, b) || coversPage(b, a);
  return one === '' ? coversPage(a, b) : coversPage(b, a);
}

/** Screen cards of one page: one route within an area, or the same own files; in card order. */
// P5-32
export function pageMerges(cards: readonly Card[]): readonly CardMerge[] {
  const screens = cards.filter((each) => each.type === 'SCRN');
  const shared = sharedFiles(screens);
  const pages: Card[][] = [];
  for (const card of screens) {
    const linked = pages.filter((page) => page.some((member) => samePage(member, card, shared)));
    // A card that fits two pages is not placed in either: a false merge is worse than a leftover.
    const [page] = linked;
    if (linked.length === 1 && page !== undefined) page.push(card);
    else pages.push([card]);
  }
  return pages.flatMap((page) => mergeOf(page) ?? []);
}

/** A host that names a system of the outside world: not local, loopback, private or a bare name. */
function isExternalHost(host: string): boolean {
  if (host === '' || host.startsWith('[') || !host.includes('.')) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  return !LOCAL_V4.some((each) => each.test(host));
}

/**
 * The external hosts the claims of a card name in URLs. The host comes from the URL parser, so user
 * info is never read; a URL that holds a mask marker or a star is skipped (masked text says nothing);
 * a bare dotted name is not a host (it may be a namespace).
 */
function hostsOf(card: Card): ReadonlySet<string> {
  const hosts = new Set<string>();
  for (const { text } of card.claims) {
    for (const [candidate] of text.matchAll(URL_IN_TEXT)) {
      if (candidate.includes('*') || /masked/iu.test(candidate)) continue;
      const url = URL.parse(candidate.replace(TRAILING_PUNCTUATION, ''));
      if (url === null || url.protocol === 'file:') continue;
      const host = url.hostname.toLowerCase();
      if (isExternalHost(host)) hosts.add(host);
    }
  }
  return hosts;
}

function shares(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return [...left].some((item) => right.has(item));
}

/** Whether two cards of one type and title cite a file in common or name the same external host. */
function related(left: Card, right: Card): boolean {
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
