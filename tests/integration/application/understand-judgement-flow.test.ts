import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '../../../src/domain/runs/run-event.js';
import { cardText, made } from '../../support/consolidate-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-301, RF-304, RF-423, RF-250, RF-241: the judgement step among the other steps of an
// understand run. It judges the claims before the summariser merges the cards, so a merged card
// keeps the verdict of every claim; a re-run with answers judges the claims of its new cards; and
// a verifier that reaches the cap of its role leaves the claims it did not judge `Unverified`
// while the run goes on.

const temp = useTempRoot('rosetta-judgement-flow-');
const allSupported = 'verifier-all-supported.json';

/** The claim ids that passed the citation check, and the claim ids judged, of one run. */
function claimIdsOf(events: readonly RunEvent[]) {
  const checked = events.filter(
    (event) => event.type === 'verify.citation.checked' && event.data['ok'] === true,
  );
  const judged = events.filter((event) => event.type === 'verify.claim.judged');
  return {
    checked: checked.map((event) => event.data['claimId']).sort(),
    judged: judged.map((event) => event.data['claimId']).sort(),
    statuses: [...new Set(judged.map((event) => event.data['status']))],
  };
}

describe('an understand run: judgement and the merge of cards', UNDERSTAND_TIMEOUT, () => {
  it('RF-301 RF-250 every claim is judged before the merge, and the merged card keeps each verdict', async () => {
    const { h, run, folder } = await made(temp.path, { verifierRecording: allSupported });

    expect(run.endState).toBe('Completed');
    const ids = claimIdsOf(await h.eventsOf(run));
    expect(ids.judged).toEqual(ids.checked);
    expect(ids.statuses).toEqual(['Supported']);
    const merged = await cardText(folder, 'ENT', 'ENT-001');
    expect(merged).toMatch(/mergedFrom:\n\s+- "ENT-001"\n\s+- "ENT-002"/u);
    expect(merged).toContain('status: "Supported"');
    expect(merged).toContain('step: "judgement"');
    expect(merged).not.toContain('status: "Proposed"');
  });
});

describe('an understand run with answers: judgement', UNDERSTAND_TIMEOUT, () => {
  it('RF-301 RF-241 the re-run judges the claims of its new cards', async () => {
    const h = await createUnderstandHarness({
      ...{ dataDir: temp.path, recording: 'understand-csharp-full.json' },
      ...{ afterwards: 'understand-csharp-answers.json', verifierRecording: allSupported },
    });
    await h.scan();
    const first = await h.understand();
    const answer = 'Yes, sold-out items stay on the home page; the shop wants them shown.';
    await h.answer(first, [{ cardId: 'OQ-001', answer }]);
    const before = h.providers.verifierRequests().length;

    const second = await h.understand({ withAnswers: true });

    expect(second.endState).toBe('Completed');
    const ids = claimIdsOf(await h.eventsOf(second));
    expect(ids.judged.length).toBeGreaterThan(0);
    expect(ids.judged).toEqual(ids.checked);
    expect(h.providers.verifierRequests()).toHaveLength(before + ids.judged.length);
    const added = await readFile(join(h.runFolder(second), 'cards', 'BR', 'BR-001.md'), 'utf8');
    expect(added).toContain('status: "Supported"');
    expect(added).not.toContain('status: "Proposed"');
  });
});

describe('an understand run whose verifier reaches its role cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-304 RF-423 the claims not judged are Unverified, the readers keep their cards and the run completes', async () => {
    const settings = understandSettings((s) => ({
      ...s,
      budget: { ...s.budget, roles: { verifier: { maxTokens: 1 } } },
    }));
    const h = await createUnderstandHarness({
      ...{ dataDir: temp.path, settings, recording: 'understand-csharp-full.json' },
      verifierRecording: allSupported,
    });
    await h.scan();

    const run = await h.understand();

    expect(run.endState).toBe('Completed');
    expect(h.providers.verifierRequests()).toEqual([]);
    const events = await h.eventsOf(run);
    const ids = claimIdsOf(events);
    expect(ids.judged).toEqual(ids.checked);
    expect(ids.statuses).toEqual(['Unverified']);
    const capEvents = events.filter((event) => event.type === 'budget.capReached');
    expect(capEvents.map((event) => event.data)).toMatchObject([
      { scope: 'role-tokens', role: 'verifier' },
    ]);
    const details = await readFile(join(h.runFolder(run), 'cards', 'BR', 'BR-001.md'), 'utf8');
    expect(details).toContain('A cap was reached before the claim was judged (RST-1600).');
  });
});
