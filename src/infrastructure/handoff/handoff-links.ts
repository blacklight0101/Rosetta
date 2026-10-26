import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-602, RF-603: the links between the files of the hand-off package. Every link is relative and
// built here from ids the code made or checked (card ids, `REQ-`, `T-`, `ADR-` ids, phase
// numbers), never from model text, so a link always points at a file and heading of the package.
// A heading that is an id alone (`## FEAT-001`) gets the anchor `#feat-001` in the common viewers.

export const handoffFiles = {
  readme: 'README.md',
  prd: 'prd.md',
  trd: 'trd.md',
  requirements: 'requirements.md',
  architecture: 'architecture.md',
  entities: 'entity-mapping.md',
  dataModel: 'data-model.md',
  apiContract: 'api/openapi.yaml',
  flows: 'flows/README.md',
  ux: 'ux/README.md',
  designBrief: 'ux/design-brief.md',
  roadmap: 'roadmap.md',
  tasks: 'tasks.md',
  risks: 'risks.md',
  openQuestions: 'open-questions.md',
  claimsLeftOut: 'claims-left-out.md',
  sources: 'sources.md',
  conventions: 'conventions.md',
  agents: 'AGENTS.md',
  fixtures: 'fixtures.md',
  workbookFormulas: 'workbook-formulas.md',
  checks: 'checks.md',
} as const;

/**
 * RF-620: the documentation set the README's reading order opens with, in the order of the
 * requirement. Each document of the set is added here by the card that writes its file (the
 * implementation plan is the one still to come), so the reading order never links a file the
 * package does not have. The API contract is written only when the front end is separate (RF-624),
 * so its entry links the file only when the package has it (readingOrder in handoff-list-markdown.ts).
 */
export const documentSet = [
  { title: 'Product requirements document', file: handoffFiles.prd },
  { title: 'Technical requirements document', file: handoffFiles.trd },
  { title: 'Target data model', file: handoffFiles.dataModel },
  { title: 'API contract', file: handoffFiles.apiContract },
  { title: 'Target flows', file: handoffFiles.flows },
  { title: 'User-interface material', file: handoffFiles.ux },
] as const;

const decisionsFolder = 'decisions';

/** `decisions/ADR-001.md`. */
export function decisionFile(id: string): string {
  return `${decisionsFolder}/${id}.md`;
}

/** A link to a decision record, from a file at the root of the package. */
export function decisionLink(id: string): string {
  return `[${id}](${decisionFile(id)})`;
}

/** A link to the heading of an id in a file of the package, from a file `depth` folders down. */
export function idLink(id: string, file: string, depth = 0): string {
  return `[${id}](${'../'.repeat(depth)}${file}#${id.toLowerCase()})`;
}

/** The source cards of an item as links into `sources.md`, or the text for none. */
export function sourceLinks(ids: readonly string[], depth = 0): string {
  if (ids.length === 0) return 'none';
  return ids.map((id) => idLink(id, handoffFiles.sources, depth)).join(', ');
}

/** A bulleted list of escaped text, or the line given for an empty list. */
export function bullets(items: readonly string[], esc: MarkdownEscaper, empty: string): string[] {
  return items.length === 0 ? [empty] : items.map((item) => `- ${esc.inline(item)}`);
}

/** RF-632: the sections of `fixtures.md`; a task card links them by the anchor of the heading. */
export const shapeSections = {
  seeds: 'Seed data stated by the cards',
  tests: 'Test data stated by the cards',
  volumes: 'Data volumes stated by the cards',
} as const;

/** A link to a section of `fixtures.md`, from a file at the root of the package. */
export function shapeLink(title: (typeof shapeSections)[keyof typeof shapeSections]): string {
  return `[${title}](${handoffFiles.fixtures}#${title.toLowerCase().replaceAll(' ', '-')})`;
}
