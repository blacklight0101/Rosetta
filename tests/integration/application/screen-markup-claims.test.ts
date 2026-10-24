import { describe, expect, it } from 'vitest';
import { withPageMarkup } from '../../../src/application/cards/with-page-markup.js';
import { createCard } from '../../../src/domain/cards/card.js';
import { webFormsMarkup } from '../../../src/infrastructure/scan/packs/csharp/webforms-markup.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import {
  contactDraft,
  contactPath,
  contactScreen,
  contactText,
} from '../../support/page-markup-fixtures.js';

// P5-31, DEC-11: a recorded page read through the reader and the C# pack makes its screen claims,
// each citing the one range of its element, with the wording of the card.

describe('P5-31 a page file to claims', () => {
  it('P5-31 four claims of one range each, and the route claim on the directive', async () => {
    const reader = new MemoryRepositoryReader({ [contactPath]: contactText });
    const bare = contactDraft({ ...contactScreen, markup: undefined });

    const { drafts } = await withPageMarkup(
      { reader, pageMarkup: webFormsMarkup },
      { drafts: [bare] },
    );
    const card = createCard({ ...(drafts[0] ?? bare), id: 'SCRN-001', agentTaskId: 't' });

    if (!card.ok) throw new Error('fixture');
    const derived = card.value.claims.slice(1);
    expect(derived.map((claim) => [claim.text, claim.citations.length])).toEqual([
      ['Email support links to mailto:help@example.test.', 1],
      ['Save starts btnSave_Click.', 1],
      ['The screen is at the route /Web/Contact.aspx, the path of its page file.', 1],
      ['Field City (text, required) is on the screen.', 1],
      ['Field Visit (calendar, optional) is on the screen.', 1],
    ]);
    expect(derived.map((claim) => claim.citations[0]?.startLine)).toEqual([5, 9, 1, 7, 8]);
  });
});
