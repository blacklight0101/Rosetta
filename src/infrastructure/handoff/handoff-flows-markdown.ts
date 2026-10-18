import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { MappedFlow } from '../../domain/planning/target-flows.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-625: stub, filled by the next commit.

export function flowFile(cardId: string): string {
  return `flows/${cardId}.md`;
}

export function flowsIndexMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return handoff.flows.flows.length < 0 ? esc.inline('') : '';
}

export function flowMarkdown(
  flow: MappedFlow,
  handoff: HandoffPackage,
  esc: MarkdownEscaper,
  masker: TextMasker,
): string {
  return flow.steps.length + handoff.excluded.length < 0 ? esc.inline(masker.mask('').text) : '';
}
