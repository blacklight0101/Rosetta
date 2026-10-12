import {
  architectureStyleIds,
  catalogueGroups,
  type ArchitectureStyle,
  type CatalogueEntry,
  type CatalogueGroup,
} from '../../src/domain/planning/catalogue.js';

// RF-606: catalogue entries and catalogue file texts for the catalogue tests.

export function sampleEntry(
  id: string,
  group: CatalogueGroup,
  defaultOn = false,
): CatalogueEntry {
  return {
    id,
    group,
    title: `Title of ${id}`,
    rule: `Rule of ${id}.`,
    why: `Why ${id} matters.`,
    check: `How to check ${id}.`,
    defaultOn,
  };
}

/** One entry per group besides the styles, and the six styles: a complete catalogue. */
export function completeEntries(): CatalogueEntry[] {
  const principles = catalogueGroups
    .filter((group) => group !== 'architecture-styles')
    .map((group) => sampleEntry(`${group}-entry`, group));
  const styles: ArchitectureStyle[] = architectureStyleIds.map((id) => ({
    ...sampleEntry(id, 'architecture-styles'),
    id,
    chooseWhen: ['One reason.', 'Another reason.'],
    avoidWhen: ['One limit.', 'Another limit.'],
  }));
  return [...principles, ...styles];
}

export interface EntryFileParts {
  readonly frontMatter?: string;
  readonly rule?: string;
  readonly extra?: string;
}

/** The text of a principle file with the given parts replaced. */
export function principleFileText(parts: EntryFileParts = {}): string {
  const frontMatter =
    parts.frontMatter ?? 'id: solid\ngroup: design-principles\ntitle: SOLID\ndefault: true';
  const rule = parts.rule ?? 'Give every module one reason to change.';
  return [
    `---\n${frontMatter}\n---\n`,
    `## Rule\n\n${rule}\n`,
    '## Why it matters\n\nSmall modules\nare easy to change.\n',
    `## How to check\n\nA reviewer names the reason.\n${parts.extra ?? ''}`,
  ].join('\n');
}

/** The text of a style file; `criteria` replaces both bullet sections. */
export function styleFileText(criteria?: string): string {
  const sections =
    criteria ??
    '## Choose it when\n\n- The team is small.\n- The domain is simple.\n\n' +
      '## Look elsewhere when\n\n- Parts scale apart.\n- Teams deploy apart.\n';
  return [
    '---\nid: layered\ngroup: architecture-styles\ntitle: Layered (N-tier)\ndefault: false\n---\n',
    '## Rule\n\nEach layer calls only the layer below it.\n',
    '## Why it matters\n\nEveryone knows it.\n',
    '## How to check\n\nNo call skips a layer.\n',
    sections,
  ].join('\n');
}
