import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-612, RF-640: the build protocol of an AI-assisted build.

type SectionWriter = (handoff: HandoffPackage, esc: MarkdownEscaper) => string[];

/** Each section of orchestration.md in order; later cards append theirs here. */
export const orchestrationSections: readonly SectionWriter[] = [];

// RF-640
export function orchestrationMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return [
    '# orchestration.md',
    '',
    ...orchestrationSections.flatMap((each) => each(handoff, esc)),
  ].join('\n');
}
