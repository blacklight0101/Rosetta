// RF-623, P5-37, P5-38, ADR-013: the column statements of a supported `ENT` claim in the reader's
// form (prompt area.v9): `Column <Table>.<name>: <type>, NOT NULL|NULL[, default <value>][, primary
// key][, foreign key to <Table>.<column>]`. The claim is untrusted text: it is cut to a bound and
// read by one flat pattern in which no part can match what the next part matches, so reading is
// linear. A claim not in the form gives nothing.

const MAX_CLAIM = 2000;
const MAX_FACTS = 50;
const NAME = '[A-Za-z_][A-Za-z0-9_]{0,62}';

const factPattern = new RegExp(
  [
    String.raw`Column\s+(?:([A-Za-z0-9_[\]]{1,64})\.)?(${NAME}):\s*([A-Za-z][A-Za-z ]{0,38}(?:\((?:\d{1,5}(?:,\s?\d{1,3})?|max)\))?),\s*(NOT NULL|NULL)`,
    String.raw`(?:,\s*default\s+('[^']{0,40}'|[^\s,;]{1,40}))?(,\s*primary key)?`,
    String.raw`(?:,\s*foreign key to\s+(${NAME})(?:\.(${NAME}))?)?`,
  ].join(''),
  'gu',
);

export interface ColumnClaim {
  /** The table the claim names, without brackets; empty when it names none. */
  readonly table: string;
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  /** The default as written; empty for none. */
  readonly default: string;
  readonly primaryKey: boolean;
  /** The table and column a foreign key points at; null for none. */
  readonly references: { readonly table: string; readonly column: string } | null;
}

function claimOf(match: RegExpMatchArray): ColumnClaim {
  const [, table = '', name = '', type = '', nulls = '', given = '', primary = ''] = match;
  const [target, targetColumn] = match.slice(7);
  return {
    ...{ table: table.replace(/[[\]]/gu, ''), name, type: type.trim() },
    ...{ nullable: nulls === 'NULL', default: given.replace(/\.$/u, '') },
    primaryKey: primary !== '',
    references: target === undefined ? null : { table: target, column: targetColumn ?? 'id' },
  };
}

/** The column statements a claim makes, at most 50. */
// RF-623
export function columnClaimsOf(text: string): ColumnClaim[] {
  return [...text.slice(0, MAX_CLAIM).matchAll(factPattern)].slice(0, MAX_FACTS).map(claimOf);
}
