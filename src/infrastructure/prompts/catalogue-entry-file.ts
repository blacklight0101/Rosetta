import type { ArchitectureStyle, CatalogueEntry } from '../../domain/planning/catalogue.js';

// RF-606, DEC-84: one catalogue file, `catalogue/<id>.v<n>.md`.

/** The entry in the text of the catalogue file `name` (RF-606). */
// RF-606
export function parseCatalogueEntry(name: string, text: string): CatalogueEntry | ArchitectureStyle {
  void text;
  return { id: name, group: 'method', title: '', rule: '', why: '', check: '', defaultOn: false };
}

/** The catalogue version declared in the README's front matter (DEC-84). */
// RF-606
export function parseCatalogueReadme(text: string): number {
  void text;
  return 0;
}
