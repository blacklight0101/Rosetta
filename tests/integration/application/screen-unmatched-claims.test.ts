import { describe, expect, it } from 'vitest';
import { withPageMarkup } from '../../../src/application/cards/with-page-markup.js';
import { createCard } from '../../../src/domain/cards/card.js';
import { webFormsMarkup } from '../../../src/infrastructure/scan/packs/csharp/webforms-markup.js';
import { MemoryRepositoryReader } from '../../support/memory-repository-reader.js';
import {
  gridCite,
  gridCodePath,
  gridDraft,
  gridPath,
  gridScreen,
  gridText,
} from '../../support/grid-page-fixtures.js';

// P5-44, DEC-11: a recorded page with a link in a grid template, read through the reader and the C#
// pack, cites the lines the agent gave for what the markup cannot match.

describe('P5-44 a page file to claims for what the markup does not show', () => {
  it('P5-44 the template link and the code-behind redirect cite the lines that name them', async () => {
    const reader = new MemoryRepositoryReader({ [gridPath]: gridText });
    const bare = gridDraft({ ...gridScreen, markup: undefined });

    const { drafts } = await withPageMarkup(
      { reader, pageMarkup: webFormsMarkup },
      { drafts: [bare] },
    );
    const card = createCard({ ...(drafts[0] ?? bare), id: 'SCRN-001', agentTaskId: 't' });

    if (!card.ok) throw new Error('fixture');
    const cited = (text: string) => card.value.claims.find((c) => c.text === text)?.citations;
    expect(cited('The screen leads to Bill.aspx.')).toEqual([gridCite(gridPath, 8, 10)]);
    expect(cited('The screen leads to HistoryUpdate.aspx.')).toEqual([gridCite(gridCodePath, 14)]);
    expect(cited('Print starts btnPrint_Click.')).toEqual([gridCite(gridPath, 14)]);
  });
});
