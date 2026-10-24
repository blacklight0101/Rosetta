import { columnClaimsOf } from './column-claims.js';
import type { DraftColumn, DraftTable, ForeignKey } from './data-model.js';
import type { SourceCard } from './plan-sources.js';

// P5-38, RF-623, ADR-013: the tables of a batch whose planner answer failed, copied from the `ENT`
// cards. The legacy data model has claims, not structured fields, so a table is read from a claim
// that states one in plain words ("The students table has an identity id and columns name, age
// (smallint), due (numeric 10,3)"): the name before `table`, the columns after the verb, a type in
// brackets or right after the column, `identity` or `primary key` for the key, and `X is a foreign
// key to T.c` for a reference. The text is untrusted and is read with bounded, linear steps: a claim
// is cut at its first 2,000 characters and no pattern backtracks over a list. A card with no such
// claim gives no table here; its claims stay unmapped and are listed as dropped by the assembler.
// Types are the claim's own words, never guessed: a column with no stated type shows "to confirm".

const MAX_CLAIM_CHARS = 2000;
const MAX_COLUMNS = 200;
const NAME = '[A-Za-z_][A-Za-z0-9_]{0,62}';
const statesTable = new RegExp(`\\b(${NAME}) table (?:has|holds|contains|links)\\b`, 'u');
const referencing = new RegExp(
  `\\b(${NAME}) is (?:an? |the )?(?:declared )?foreign key (?:of ${NAME} )?\\(?to (?:the )?(${NAME})(?:\\.(${NAME}))?`,
  'gu',
);
const nameOnly = new RegExp(`^${NAME}$`, 'u');
const identityKey = new RegExp(`^(?:an? )?identity (?:primary key )?(${NAME})$`, 'u');
const typeAfterName = new RegExp(`^(${NAME})\\s+([A-Za-z]+\\(\\d{1,5}(?:,\\d{1,3})?\\))$`, 'u');
const withBrackets = new RegExp(`^(${NAME}) \\((.{0,200})\\)$`, 'u');
const bracketType = /^([A-Za-z]+)(?: (\d{1,5})(?:,(\d{1,3}))?)?$/u;
const bracketReference = new RegExp(
  `^an? foreign key to (?:the )?(${NAME})(?:\\.(${NAME}))?$`,
  'u',
);

/** Data types of any database a claim may name; another word in brackets is a note, not a type. */
const typeWords = new Set(
  [
    ...['int', 'integer', 'smallint', 'bigint', 'tinyint', 'bit', 'boolean', 'bool'],
    ...['numeric', 'decimal', 'float', 'real', 'double', 'money', 'number'],
    ...['char', 'varchar', 'nvarchar', 'nchar', 'text', 'ntext', 'string'],
    ...['date', 'datetime', 'datetime2', 'time', 'timestamp', 'uuid', 'guid'],
    ...['blob', 'binary', 'varbinary', 'image', 'bytea'],
  ].map((word) => word.toLowerCase()),
);

interface Reading {
  readonly column: DraftColumn;
  readonly primary: boolean;
  readonly reference: { readonly table: string; readonly column: string } | null;
}

function typeOf(word: string, size: string | undefined, scale: string | undefined): string {
  if (!typeWords.has(word.toLowerCase())) return '';
  if (size === undefined) return word;
  return scale === undefined ? `${word}(${size})` : `${word}(${size},${scale})`;
}

/** Splits at commas that are not inside brackets; "and" between items counts as a comma. */
function itemsOf(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body.replace(/\s+and\s+/gu, ', ')) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      items.push(current.trim());
      current = '';
    } else current += char;
  }
  return [...items, current.trim()].filter((item) => item !== '');
}

function stripFiller(item: string): string {
  return item
    .replace(/^(?:the |a |an )?(?:columns? )(?:for |are |of )?/u, '')
    .replace(/^(?:the )?(?:columns? )?/u, '')
    .replace(/\s+columns?$/u, '')
    .trim();
}

function columnOf(name: string, type: string, nullable: boolean, claim: string): DraftColumn {
  const legacy = { claim, field: name };
  return { name, type, nullable, legacy, risk: '' };
}

/** One list item as a column, or undefined when it is not one (a note, a sentence). */
function readItem(raw: string, claim: string): Reading | undefined {
  const item = stripFiller(raw);
  const identity = identityKey.exec(item);
  if (identity?.[1] !== undefined) {
    return { column: columnOf(identity[1], '', false, claim), primary: true, reference: null };
  }
  const typed = typeAfterName.exec(item);
  if (typed?.[1] !== undefined && typed[2] !== undefined) {
    const column = columnOf(typed[1], typed[2], true, claim);
    return { column, primary: false, reference: null };
  }
  const bracketed = withBrackets.exec(item);
  if (bracketed?.[1] !== undefined && bracketed[2] !== undefined) {
    return readBracketed(bracketed[1], bracketed[2], claim);
  }
  if (!nameOnly.test(item)) return undefined;
  return { column: columnOf(item, '', true, claim), primary: false, reference: null };
}

function readBracketed(name: string, inside: string, claim: string): Reading {
  const [first = '', ...rest] = inside.split(',').map((part) => part.trim());
  const joined = [first, ...rest].join(',');
  const reference = bracketReference.exec(joined);
  if (reference?.[1] !== undefined) {
    const target = { table: reference[1], column: reference[2] ?? 'id' };
    return { column: columnOf(name, '', true, claim), primary: false, reference: target };
  }
  // "numeric 10,3" has a comma of its own: the type is the first one or two parts that read as one.
  const withScale = bracketType.exec(`${first},${rest[0] ?? ''}`.replace(/,$/u, ''));
  const single = bracketType.exec(first);
  const match = withScale?.[3] === undefined ? single : withScale;
  const type = match?.[1] === undefined ? '' : typeOf(match[1], match[2], match[3]);
  const notNull = /\bnot null\b/iu.test(inside);
  return { column: columnOf(name, type, !notNull, claim), primary: false, reference: null };
}

interface Draft {
  columns: DraftColumn[];
  primaryKey: string[];
  foreignKeys: ForeignKey[];
  sources: Set<string>;
  title: string;
}

function sentenceAfter(text: string, from: number): string {
  const rest = text.slice(from, from + MAX_CLAIM_CHARS);
  const end = rest.search(/\.(?:\s+[A-Z]|\s*$)/u);
  return end < 0 ? rest : rest.slice(0, end);
}

function addReading(draft: Draft, reading: Reading): void {
  const { column } = reading;
  if (draft.columns.length >= MAX_COLUMNS) return;
  if (draft.columns.some((each) => each.name === column.name)) return;
  draft.columns.push(column);
  if (reading.primary) draft.primaryKey.push(column.name);
  if (reading.reference !== null) {
    const { table, column: target } = reading.reference;
    draft.foreignKeys.push({
      columns: [column.name],
      references: table,
      referencedColumns: [target],
    });
  }
}

function addReferences(draft: Draft, text: string): void {
  for (const match of text.slice(0, MAX_CLAIM_CHARS).matchAll(referencing)) {
    const [, from, table, column] = match;
    if (from === undefined || table === undefined) continue;
    const own = draft.columns.find((each) => each.name.toLowerCase() === from.toLowerCase());
    if (own === undefined) continue;
    if (draft.foreignKeys.some((key) => key.columns.includes(own.name))) continue;
    draft.foreignKeys.push({
      columns: [own.name],
      references: table,
      referencedColumns: [column ?? 'id'],
    });
  }
}

const nameKeys = new WeakMap<Draft, string>();

function draftFor(drafts: Map<string, Draft>, card: SourceCard, name: string): Draft {
  const key = name.toLowerCase();
  const draft = drafts.get(key) ?? {
    ...{ columns: [], primaryKey: [], foreignKeys: [], title: card.title },
    sources: new Set<string>(),
  };
  drafts.set(key, draft);
  nameKeys.set(draft, nameKeys.get(draft) ?? name);
  draft.sources.add(card.id);
  return draft;
}

/** The reader's own column statements (`Column T.c: type, NOT NULL, ...`), the form current runs write. */
function readColumnClaims(
  drafts: Map<string, Draft>,
  card: SourceCard,
  claim: SourceCard['claims'][number],
): boolean {
  const claims = columnClaimsOf(claim.text).filter((each) => nameOnly.test(each.table));
  for (const each of claims) {
    const draft = draftFor(drafts, card, each.table);
    const reference = each.references;
    addReading(draft, {
      column: columnOf(each.name, each.type, each.nullable, claim.claimId),
      primary: each.primaryKey,
      reference: reference === null ? null : { table: reference.table, column: reference.column },
    });
  }
  return claims.length > 0;
}

function readClaim(
  drafts: Map<string, Draft>,
  card: SourceCard,
  claim: SourceCard['claims'][number],
) {
  if (readColumnClaims(drafts, card, claim)) return;
  const text = claim.text.slice(0, MAX_CLAIM_CHARS);
  const stated = statesTable.exec(text);
  const name = stated?.[1];
  if (stated === null || name === undefined) {
    // A claim that only states a reference belongs to the tables its card has stated so far.
    for (const draft of drafts.values()) if (draft.sources.has(card.id)) addReferences(draft, text);
    return;
  }
  const draft = draftFor(drafts, card, name);
  const body = sentenceAfter(text, stated.index + stated[0].length);
  for (const item of itemsOf(body)) {
    const reading = readItem(item, claim.claimId);
    if (reading !== undefined) addReading(draft, reading);
  }
  addReferences(draft, text);
}

function tableOf(draft: Draft): DraftTable {
  return {
    name: nameKeys.get(draft) ?? '',
    purpose: `Copied from the legacy model (${draft.title}); the planner's answer for it failed, so confirm it.`,
    sources: [...draft.sources],
    columns: draft.columns,
    primaryKey: draft.primaryKey,
    uniqueKeys: [],
    foreignKeys: draft.foreignKeys,
    checks: [],
    indexes: [],
    copiedFromLegacy: true,
  };
}

/**
 * The tables the supported claims of these `ENT` cards state, with their columns, types as written,
 * keys and references, each marked as copied from the legacy model. Empty when no claim states one.
 */
// P5-38, RF-623
export function legacyTablesOf(cards: readonly SourceCard[]): DraftTable[] {
  const drafts = new Map<string, Draft>();
  for (const card of cards.filter((each) => each.type === 'ENT')) {
    for (const claim of card.claims.filter((each) => each.status === 'Supported')) {
      readClaim(drafts, card, claim);
    }
  }
  return [...drafts.values()].map(tableOf);
}
