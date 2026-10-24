import type { ClaimVerbs } from './claim-verbs.js';
import type { StackData } from './stack-data.js';

// RF-606, ADR-018, DEC-73, DEC-74, DEC-84: the principle catalogue `plan` chooses from. Each entry
// is one versioned Markdown file under `prompts/catalogue/` with a one-line rule, why it matters and
// how to check it; an architecture style adds when to choose it and when to look elsewhere
// (RF-608). The catalogue version and the SHA-256 of its files go to the run manifest (RNF-004).

/** The groups of RF-606, in the order the catalogue lists them. */
export const catalogueGroups = [
  'design-principles',
  'method',
  'architecture-styles',
  'modernisation',
  'quality-gates',
  'documentation',
  'security',
  'delivery',
  'ai-assisted-build',
] as const;

export type CatalogueGroup = (typeof catalogueGroups)[number];

/** The six architecture styles Rosetta recommends from (RF-608, DEC-76). */
export const architectureStyleIds = [
  'layered',
  'modular-monolith',
  'hexagonal',
  'clean',
  'event-driven',
  'microservices',
] as const;

export type ArchitectureStyleId = (typeof architectureStyleIds)[number];

export interface CatalogueEntry {
  /** The file stem, for example `solid` for `catalogue/solid.v1.md`. */
  readonly id: string;
  readonly group: CatalogueGroup;
  readonly title: string;
  /** One line. */
  readonly rule: string;
  readonly why: string;
  readonly check: string;
  /** Switched on in a new planning brief (DEC-74). */
  readonly defaultOn: boolean;
}

/** An entry of the `architecture-styles` group with its selection criteria (RF-608). */
export interface ArchitectureStyle extends CatalogueEntry {
  readonly id: ArchitectureStyleId;
  readonly chooseWhen: readonly string[];
  readonly avoidWhen: readonly string[];
}

export interface Catalogue {
  /** The catalogue version declared in its README, recorded by every plan run (DEC-84). */
  readonly version: number;
  /** Lower-case hexadecimal SHA-256 over every catalogue file, by name. */
  readonly sha256: string;
  /** Every entry, styles included, in group order and then by id. */
  readonly entries: readonly CatalogueEntry[];
  readonly styles: readonly ArchitectureStyle[];
  /** RF-609: the technologies and rules of the stack check; part of the hashed folder. */
  readonly stack: StackData;
  /** P5-43: the verbs that contradict each other in the claim meaning check; part of the hashed folder. */
  readonly claimVerbs: ClaimVerbs;
}

export function isArchitectureStyleId(id: string): id is ArchitectureStyleId {
  return architectureStyleIds.some((style) => style === id);
}

/** Whether an entry is one of the six architecture styles with its selection criteria. */
export function isArchitectureStyle(entry: CatalogueEntry): entry is ArchitectureStyle {
  return isArchitectureStyleId(entry.id) && 'chooseWhen' in entry && 'avoidWhen' in entry;
}

function repeatedIds(entries: readonly CatalogueEntry[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { id } of entries) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated];
}

/** What is wrong with a set of entries: a repeated id, an empty group, a missing style. */
// RF-606, RF-608
export function catalogueProblems(entries: readonly CatalogueEntry[]): string[] {
  const styles = new Set(entries.filter(isArchitectureStyle).map((entry) => entry.id));
  return [
    ...repeatedIds(entries).map((id) => `The entry ${id} appears more than once.`),
    ...catalogueGroups
      .filter((group) => !entries.some((entry) => entry.group === group))
      .map((group) => `The group ${group} has no entry.`),
    ...architectureStyleIds
      .filter((id) => !styles.has(id))
      .map((id) => `The architecture style ${id} is missing.`),
  ];
}

/** The entry ids a new planning brief switches on (RF-606, DEC-74), sorted. */
// RF-606
export function defaultPrinciples(catalogue: Catalogue): string[] {
  return catalogue.entries
    .filter((entry) => entry.defaultOn)
    .map((entry) => entry.id)
    .sort();
}
