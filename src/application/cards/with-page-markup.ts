import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { PageMarkup } from '../../domain/cards/page-markup.js';
import type { RepositoryReader } from '../ports/repository-reader.js';

// P5-31: stub until the step is written.
export function withPageMarkup<T extends { readonly drafts: readonly CardDraft[] }>(
  _source: {
    readonly reader: Pick<RepositoryReader, 'readBytes'>;
    readonly pageMarkup?: (path: string, text: string) => PageMarkup | undefined;
  },
  outcome: T,
): Promise<T> {
  return Promise.resolve(outcome);
}
