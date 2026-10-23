import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { DataModelProblem } from './data-model-answer.js';

// RF-623, P3-120: a column or table that a requirement or rule card names, and the model neither
// has nor lists as dropped, is listed in checks.md. A name is read from a card only when it looks
// like an identifier of the legacy data: in backticks, `tbl` plus a capital, or words joined by
// underscores; code identifiers (PascalCase and I-prefixed interfaces, camelCase, type keywords,
// on_click or page_load style handlers) are skipped, and only a name the `ENT` cards also mention
// (the legacy evidence) counts. At most 20 are listed, then "and N more". It matches a table, a column, a legacy field name or a dropped field, ignoring case,
// underscores, a `tbl` prefix and a final `s`.

const identifier =
  /`([A-Za-z_][A-Za-z0-9_]*)`|\b(tbl[A-Z][A-Za-z0-9]*|[a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/gu;

const reason =
  'A requirement or rule card names it, and the model has no such table or column and does not list it as dropped.';

function plain(name: string): string {
  return name.toLowerCase().replace(/_/gu, '').replace(/^tbl/u, '').replace(/s$/u, '');
}

function presentIn(model: TargetDataModel): Set<string> {
  const names = model.tables.flatMap((table) => [
    table.name,
    ...table.columns.flatMap((column) => [column.name, column.legacy?.field ?? '']),
  ]);
  return new Set([...names, ...model.dropped.map((each) => each.field)].map(plain));
}

const MAX_LISTED = 20;
const typeWords = new Set([
  ...['int', 'integer', 'bigint', 'smallint', 'tinyint', 'varchar', 'nvarchar', 'char', 'text'],
  ...['bit', 'date', 'datetime', 'decimal', 'numeric', 'float', 'bool', 'boolean', 'string'],
  ...['null', 'true', 'false', 'uuid', 'guid'],
]);
const handler = /^(?:on|get|set)_|_(?:click|load|changed|handler|event)$/u;

/** True for a name that is code (a class, a camelCase member, a type word, a handler), not data. */
function isCode(name: string): boolean {
  if (/^tbl[A-Z]/u.test(name)) return false;
  return (
    /^[A-Z]/u.test(name) ||
    /[a-z][A-Z]/u.test(name) ||
    typeWords.has(name.toLowerCase()) ||
    handler.test(name)
  );
}

const shaped = /_(?:id|code|date|status|type)$|^(?:tbl|tb|t|dim|fact|lkp|ref)_/u;

interface Named {
  readonly name: string;
  /** True for a name that is clearly a database name whatever the entity cards say. */
  readonly strong: boolean;
}

/** The data names a text says. */
function namesOf(text: string): Named[] {
  return [...text.matchAll(identifier)]
    .map((match) => {
      const name = match[1] ?? match[2] ?? '';
      const strong = match[1] !== undefined || /^tbl[A-Z]/u.test(name) || shaped.test(name);
      return { name, strong };
    })
    .filter(({ name }) => name !== '' && !isCode(name));
}

const squeeze = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/gu, '');

/** The `ENT` cards' words, squeezed, so a name can be looked up in them. */
function evidenceOf(cards: readonly SourceCard[]): string {
  return cards
    .filter((card) => card.type === 'ENT')
    .map((card) =>
      squeeze(
        [
          card.title,
          card.summary,
          ...card.claims.filter((c) => c.status === 'Supported').map((c) => c.text),
        ].join(' '),
      ),
    )
    .join(' ');
}

function isRuleCard(card: SourceCard): boolean {
  return card.type === 'BR' || card.type === 'FEAT';
}

function evidenced({ name, strong }: Named, evidence: string): boolean {
  const key = plain(name);
  return key.length >= 3 && (strong || evidence.includes(key));
}

/**
 * The requirement and rule cards cut to the supported claims that name a table or column the
 * legacy evidence also mentions; the data-model call sends these (and packs them to the window).
 */
// RF-623, P3-120
export function ruleCandidates(cards: readonly SourceCard[]): SourceCard[] {
  const evidence = evidenceOf(cards);
  return cards.filter(isRuleCard).flatMap((card) => {
    const claims = card.claims.filter(
      (claim) =>
        claim.status === 'Supported' &&
        namesOf(claim.text).some((name) => evidenced(name, evidence)),
    );
    return claims.length === 0 ? [] : [{ ...card, claims }];
  });
}

/** The names the requirement and rule cards say that the model lacks, once each, with the claim that says it. */
// RF-623, P3-120
export function missingNamed(
  model: TargetDataModel,
  cards: readonly SourceCard[],
): DataModelProblem[] {
  const present = presentIn(model);
  const evidence = evidenceOf(cards);
  const claims = ruleCandidates(cards).flatMap((card) => card.claims);
  const problems: DataModelProblem[] = [];
  for (const claim of claims) {
    for (const named of namesOf(claim.text).filter((each) => evidenced(each, evidence))) {
      const { name } = named;
      if (present.has(plain(name))) continue;
      present.add(plain(name));
      problems.push({ item: name, field: `card claim ${claim.claimId}`, reason });
    }
  }
  if (problems.length <= MAX_LISTED) return problems;
  const more = problems.length - MAX_LISTED;
  const last = {
    item: `and ${String(more)} more`,
    field: 'requirement and rule cards',
    reason: 'More names are in the cards than are listed here; check the cards for the rest.',
  };
  return [...problems.slice(0, MAX_LISTED), last];
}
