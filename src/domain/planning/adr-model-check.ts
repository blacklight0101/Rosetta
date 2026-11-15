import type { ModelTable } from './data-model.js';
import type { PlanDecision } from './plan-content.js';

// RF-623, P9-15, EV-108: the target data model read against the plan's decision records. Only a
// record whose words name an identifier strategy or a stored structure is checked (the eShop
// ADR-001 "Hi-lo ids generated in the application" needs its hi-lo tables); the planner names
// what such a record needs that the model lacks, and the code keeps a finding only for a record
// it was sent and a structure that is not already a table of the model. Nothing here fails a plan:
// the findings are listed in checks.md.

interface AdrModelFinding {
  /** The id of the record, for example `ADR-001`. */
  readonly decision: string;
  readonly title: string;
  /** The table, sequence or column the record needs, as the planner named it. */
  readonly structure: string;
  readonly reason: string;
}

/** What checks.md says: the findings with the count dropped, or why the check could not run. */
export type AdrModelCheck =
  | {
      readonly kind: 'checked';
      readonly findings: readonly AdrModelFinding[];
      readonly dropped: number;
    }
  | { readonly kind: 'not-run'; readonly reason: string };

export interface AdrModelDraft {
  readonly missing: readonly {
    readonly decision: string;
    readonly structure: string;
    readonly reason: string;
  }[];
}

/** Words that name an identifier strategy or a structure the data model keeps. */
const STORED =
  /\b(?:ids?|identifiers?|identity|keys?|sequences?|hi-?lo|tables?|schemas?|columns?|index(?:es)?|indices|audit|history|outbox|guids?|uuids?)\b/iu;

// RF-623
export function decisionsNeedingData(decisions: readonly PlanDecision[]): PlanDecision[] {
  return decisions.filter(({ title, context, decision, consequences }) =>
    STORED.test([title, context, decision, consequences].join('\n')),
  );
}

/** A name with its case, separators and a final plural left out, so `Catalog_Brands` is `catalogbrand`. */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '')
    .replace(/s$/u, '');
}

const byRecordAndStructure = (a: AdrModelFinding, b: AdrModelFinding): number =>
  a.decision === b.decision
    ? Number(a.structure > b.structure) - Number(a.structure < b.structure)
    : Number(a.decision > b.decision) - Number(a.decision < b.decision);

// RF-623
export function adrModelFindings(
  draft: AdrModelDraft,
  sent: readonly PlanDecision[],
  tables: readonly Pick<ModelTable, 'name'>[],
): AdrModelCheck {
  const titles = new Map(sent.map((each) => [each.id, each.title]));
  const known = new Set(tables.map((table) => nameKey(table.name)));
  const seen = new Set<string>();
  const findings: AdrModelFinding[] = [];
  for (const { decision, structure, reason } of draft.missing) {
    const title = titles.get(decision);
    const key = `${decision}\n${nameKey(structure)}`;
    if (title === undefined || known.has(nameKey(structure)) || seen.has(key)) continue;
    seen.add(key);
    findings.push({ decision, title, structure, reason });
  }
  findings.sort(byRecordAndStructure);
  return { kind: 'checked', findings, dropped: draft.missing.length - findings.length };
}
