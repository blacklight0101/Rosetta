import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// RF-621 (stub, replaced by the implementation).
export function prdMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return handoff.prd.roles.map((role) => esc.inline(role.name)).join('');
}
