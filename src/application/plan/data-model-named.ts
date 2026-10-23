import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { DataModelProblem } from './data-model-answer.js';

// RF-623, P3-120: a column or table that a requirement or rule card names, and the model neither
// has nor lists as dropped, is listed in checks.md. A name is read from a card only when it looks
// like an identifier of the legacy data: in backticks, `tbl` plus a capital, or words joined by
// underscores. It matches a table, a column, a legacy field name or a dropped field, ignoring case,
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

function namesIn(card: SourceCard): { readonly name: string; readonly claimId: string }[] {
  return card.claims
    .filter((claim) => claim.status === 'Supported')
    .flatMap((claim) =>
      [...claim.text.matchAll(identifier)].map((match) => ({
        name: match[1] ?? match[2] ?? '',
        claimId: claim.claimId,
      })),
    );
}

/** The names the requirement and rule cards say that the model lacks, once each, with the claim that says it. */
// RF-623, P3-120
export function missingNamed(
  model: TargetDataModel,
  cards: readonly SourceCard[],
): DataModelProblem[] {
  const present = presentIn(model);
  const problems: DataModelProblem[] = [];
  for (const card of cards.filter((each) => each.type === 'BR' || each.type === 'FEAT')) {
    for (const { name, claimId } of namesIn(card)) {
      const key = plain(name);
      if (key === '' || present.has(key)) continue;
      present.add(key);
      problems.push({ item: name, field: `card claim ${claimId}`, reason });
    }
  }
  return problems;
}
