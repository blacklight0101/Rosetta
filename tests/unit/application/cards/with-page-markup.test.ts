import { describe, expect, it } from 'vitest';
import { withPageMarkup } from '../../../../src/application/cards/with-page-markup.js';
import type { PageMarkup } from '../../../../src/domain/cards/page-markup.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { err, ok } from '../../../../src/domain/errors/result.js';
import { draftOf } from '../../../support/card-fixtures.js';
import {
  contactDraft,
  contactMarkup,
  contactPath,
  contactScreen,
  contactText,
} from '../../../support/page-markup-fixtures.js';

// P5-31, DEC-11: after a reader task, the markup of the page files its screen cites is read through
// the reader and the pack, and rides on the screen so the card can cite each element's own lines.

function bare() {
  const draft = contactDraft({ ...contactScreen, markup: undefined });
  return draft;
}

function readerOf(files: Record<string, string>) {
  return {
    readBytes: (request: { path: string }) => {
      const text = files[request.path];
      if (text === undefined)
        return Promise.resolve(
          err({ code: ERROR_CODES.fileNotFound, reason: 'not-found', message: 'gone' } as const),
        );
      const bytes = new TextEncoder().encode(text);
      return Promise.resolve(ok({ path: request.path, sizeBytes: bytes.length, bytes }));
    },
  };
}

const lookup = (path: string, text: string): PageMarkup | undefined =>
  path === contactPath && text === contactText ? contactMarkup : undefined;

describe('P5-31 the markup of the pages a screen cites', () => {
  it('P5-31 adds the markup of each cited page file the pack reads', async () => {
    const draft = bare();
    const reader = readerOf({ [contactPath]: contactText });

    const out = await withPageMarkup({ reader, pageMarkup: lookup }, { drafts: [draft] });

    expect(out.drafts[0]?.screen?.markup).toEqual([contactMarkup]);
  });

  it('P5-31 leaves the draft as it is without a pack, a readable file or a screen', async () => {
    const draft = bare();
    const plain = draftOf();

    const none = await withPageMarkup({ reader: readerOf({}) }, { drafts: [draft, plain] });
    const missing = await withPageMarkup(
      { reader: readerOf({}), pageMarkup: lookup },
      { drafts: [draft, plain] },
    );

    expect(none.drafts).toEqual([draft, plain]);
    expect(missing.drafts).toEqual([draft, plain]);
  });
});
