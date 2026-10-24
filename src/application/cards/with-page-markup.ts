import type { CardDraft } from '../../domain/cards/card-ids.js';
import type { PageMarkup } from '../../domain/cards/page-markup.js';
import type { RepositoryReader } from '../ports/repository-reader.js';

// P5-31, DEC-11, RF-626, ADR-005: a screen card states its fields, buttons, links and route in
// claims, and each claim cites the lines of the one element that shows it. The reader of a task
// does not give those lines, so after the task the page files its screen cites are read once
// through the guarded reader and handed to the language pack of their extension, which returns the
// elements with their lines. The markup rides on the draft only until the card makes its claims.

const maxPageBytes = 500_000;

export interface PageMarkupSource {
  readonly reader: Pick<RepositoryReader, 'readBytes'>;
  /** The pack's reading of a page file; absent when the run has no packs. */
  readonly pageMarkup?: ((path: string, text: string) => PageMarkup | undefined) | undefined;
}

/** The files a draft cites for its screen, once each, in the order cited. */
function citedPaths(draft: CardDraft): readonly string[] {
  const claims = draft.claims.flatMap((claim) => claim.citations);
  const validations = (draft.screen?.fields ?? []).flatMap((field) =>
    field.validations.flatMap((validation) => validation.citations),
  );
  return [...new Set([...claims, ...validations].map((citation) => citation.path))];
}

async function markupOf(
  source: PageMarkupSource,
  pageMarkup: NonNullable<PageMarkupSource['pageMarkup']>,
  path: string,
): Promise<readonly PageMarkup[]> {
  const read = await source.reader.readBytes({ path, maxBytes: maxPageBytes });
  if (!read.ok || read.value.bytes === undefined) return [];
  const markup = pageMarkup(path, new TextDecoder('utf-8').decode(read.value.bytes));
  return markup === undefined ? [] : [markup];
}

async function withMarkup(source: PageMarkupSource, draft: CardDraft): Promise<CardDraft> {
  const { pageMarkup } = source;
  if (pageMarkup === undefined || draft.type !== 'SCRN' || draft.screen === undefined) return draft;
  const markup: PageMarkup[] = [];
  for (const path of citedPaths(draft)) markup.push(...(await markupOf(source, pageMarkup, path)));
  return markup.length === 0 ? draft : { ...draft, screen: { ...draft.screen, markup } };
}

/** The outcome of a reader task with the markup of the pages its screen cards cite. */
// RF-626
export async function withPageMarkup<T extends { readonly drafts: readonly CardDraft[] }>(
  source: PageMarkupSource,
  outcome: T,
): Promise<T> {
  if (source.pageMarkup === undefined) return outcome;
  const drafts: CardDraft[] = [];
  for (const draft of outcome.drafts) drafts.push(await withMarkup(source, draft));
  return { ...outcome, drafts };
}
