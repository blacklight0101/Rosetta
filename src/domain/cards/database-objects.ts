import type { CodeMap } from '../code-map/code-map.js';
import { isThirdPartyFile } from '../code-map/third-party.js';
import { DATABASE_OBJECT_KINDS, type DatabaseObjectKind } from '../code-map/vocabulary.js';
import type { AreaCoverage } from './area-coverage.js';
import type { Card } from './card.js';

// P5-36, RF-230, RF-209: the tables, views, procedures, triggers and functions the scan lists, and
// for each the card that states what it does. A card states an object when one of its claims, not
// `Rejected`, cites lines of the object. An object that a card only names in its text is "named
// only"; one that no card names has "no card". A Deepen reads those two kinds first.

export interface DatabaseObject {
  readonly kind: DatabaseObjectKind;
  readonly name: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

type ObjectState = 'card' | 'named-only' | 'no-card';

export interface ObjectCoverage extends DatabaseObject {
  readonly state: ObjectState;
  /** The ids of the cards that state the object, in card order. */
  readonly cards: readonly string[];
}

const objectKinds: ReadonlySet<string> = new Set(DATABASE_OBJECT_KINDS);

/** The objects of the code map outside third-party files, in code-map order. */
export function databaseObjectsOf(map: Pick<CodeMap, 'files' | 'symbols'>): DatabaseObject[] {
  const thirdParty = new Set(map.files.filter(isThirdPartyFile).map((file) => file.path));
  return map.symbols.flatMap(({ kind, name, path, startLine, endLine }) =>
    objectKinds.has(kind) && !thirdParty.has(path)
      ? [{ kind: kind as DatabaseObjectKind, name, path, startLine, endLine }]
      : [],
  );
}

/** The objects held in files of the areas the run's coverage lists. */
export function objectsInCoverage(
  map: Pick<CodeMap, 'files' | 'symbols'>,
  coverage: readonly Pick<AreaCoverage, 'files'>[],
): DatabaseObject[] {
  const paths = new Set(coverage.flatMap((area) => area.files.map((file) => file.path)));
  return databaseObjectsOf(map).filter((object) => paths.has(object.path));
}

/** The coverage of the objects held in the areas the run listed, against the cards so far. */
export function objectCoverageIn(
  map: Pick<CodeMap, 'files' | 'symbols'>,
  coverage: readonly Pick<AreaCoverage, 'files'>[],
  cards: readonly Card[],
): readonly ObjectCoverage[] {
  return objectCoverage(objectsInCoverage(map, coverage), cards);
}

function statesObject(card: Card, object: DatabaseObject): boolean {
  return card.claims.some(
    (claim) =>
      claim.status !== 'Rejected' &&
      claim.citations.some(
        (cite) =>
          cite.path === object.path &&
          cite.startLine <= object.endLine &&
          cite.endLine >= object.startLine,
      ),
  );
}

/** The lower-case words of a card's text: title, summary and claims. */
function wordsOf(card: Card): ReadonlySet<string> {
  const text = [card.title, card.summary, ...card.claims.map((claim) => claim.text)].join(' ');
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}_]+/u));
}

// P5-36
export function objectCoverage(
  objects: readonly DatabaseObject[],
  cards: readonly Card[],
): readonly ObjectCoverage[] {
  const words = cards.map(wordsOf);
  return objects.map((object) => {
    const stating = cards.filter((card) => statesObject(card, object)).map((card) => card.id);
    if (stating.length > 0) return { ...object, state: 'card', cards: stating };
    const lower = object.name.toLowerCase();
    const named = words.some((each) => each.has(lower));
    return { ...object, state: named ? 'named-only' : 'no-card', cards: [] };
  });
}

/** The objects no card states, in code-map order. */
export function uncoveredObjects(
  objects: readonly DatabaseObject[],
  cards: readonly Card[],
): readonly ObjectCoverage[] {
  return objectCoverage(objects, cards).filter((object) => object.state !== 'card');
}
