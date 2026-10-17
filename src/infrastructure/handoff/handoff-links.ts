import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-602, RF-603: the links between the files of the hand-off package. Every link is relative and
// built here from ids the code made or checked (card ids, `REQ-`, `T-`, `ADR-` ids, phase
// numbers), never from model text, so a link always points at a file and heading of the package.
// A heading that is an id alone (`## FEAT-001`) gets the anchor `#feat-001` in the common viewers.

export const handoffFiles = {
  readme: 'README.md',
  requirements: 'requirements.md',
  architecture: 'architecture.md',
  entities: 'entity-mapping.md',
  roadmap: 'roadmap.md',
  tasks: 'tasks.md',
  risks: 'risks.md',
  openQuestions: 'open-questions.md',
  sources: 'sources.md',
} as const;

const decisionsFolder = 'decisions';

/** `decisions/ADR-001.md`. */
export function decisionFile(id: string): string {
  return `${decisionsFolder}/${id}.md`;
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
