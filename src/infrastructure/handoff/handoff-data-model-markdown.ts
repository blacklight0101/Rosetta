import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-623: stub, written with the tests.
export function dataModelMarkdown(
  model: TargetDataModel,
  esc: MarkdownEscaper,
  masker: TextMasker,
): string {
  return model.tables.length < 0 ? esc.inline(masker.mask('').text) : '';
}
