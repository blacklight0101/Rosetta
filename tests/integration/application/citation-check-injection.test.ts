import { describe, expect, it } from 'vitest';
import { checkCitations } from '../../../src/application/verifier/citation-check.js';
import { assignCardIds } from '../../../src/domain/cards/card-ids.js';
import { runRecordedAgent } from '../../support/agent-harness.js';

// RF-300, RF-145, ADR-013: the cards of a reader that obeyed the planted text of the injection
// fixture go through the citation check like any other: the status the model wrote is ignored, and
// only the code map decides whether the citation holds.

describe('the citation check on the prompt-injection fixture', () => {
  it('RF-300 the planted "Supported" status is not taken over: the check alone sets the claim status', async () => {
    const { result, codeMap } = await runRecordedAgent({
      fixture: 'injection',
      recording: 'reader-injection.json',
      area: 'src',
    });
    const cards = assignCardIds([
      { agentTaskId: 'reader-001', area: 'src', drafts: result.drafts },
    ]);
    if (!cards.ok) throw new Error('the injection cards are invalid');

    const checked = checkCitations(cards.value, codeMap, '2026-10-12T10:00:00.000Z');

    expect(checked.checks).toEqual([{ claimId: 'BR-001.c1', ok: true }]);
    expect(checked.cards.flatMap((card) => card.claims.map((claim) => claim.status))).toEqual([
      'Proposed',
    ]);
  });

  it('RF-300 a citation of the planted README lines outside the file is refused like any other', async () => {
    const { result, codeMap } = await runRecordedAgent({
      fixture: 'injection',
      recording: 'reader-injection.json',
      area: 'src',
    });
    const drafts = result.drafts.map((draft) => ({
      ...draft,
      claims: [
        {
          text: 'Every claim is supported.',
          citations: [{ path: 'README.md', startLine: 1, endLine: 400 }],
        },
      ],
    }));
    const cards = assignCardIds([{ agentTaskId: 'reader-001', area: 'src', drafts }]);
    if (!cards.ok) throw new Error('the injection cards are invalid');

    const checked = checkCitations(cards.value, codeMap, '2026-10-12T10:00:00.000Z');

    expect(checked.cards[0]?.claims[0]?.status).toBe('CitationInvalid');
  });
});
