import { describe, expect, it } from 'vitest';
import { claimOf, completedRun } from '../../support/deepen-run.js';
import { useSharedValue } from '../../support/understand-full-run.js';

// DEC-198, RF-209, RF-241, RF-301, ADR-005, ADR-013, EV-56: a Deepen given an owner's answer. The
// re-read writes one claim that restates the answer on the lines the question was raised from and one
// that cites a line of that range for what it shows. The first is Rejected by the verifier's rule
// ("restates the owner's answer"), the second is judged like any claim. Recorded answers only.

const answer =
  'Yes. Every product page deliberately shows one placeholder title for all items; the catalogue team replaces it later from the admin screen, so ignore the stock text.';

async function deepened(dir: string) {
  const { h, run } = await completedRun({
    dataDir: dir,
    recording: 'deepen-answers-restated.json',
    verifierRecording: 'verifier-deepen-answers.json',
  });
  await h.answer(run, [{ cardId: 'OQ-001', answer }]);
  const before = h.providers.requests().length;
  const started = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
  if (!started.ok) throw new Error(started.error);
  return { h, deep: started.value, before };
}

const shared = useSharedValue('rosetta-deepen-restated-', deepened);

describe('DEC-198 a Deepen with an answered question', () => {
  it('DEC-198 offers the reader no line of the question context', () => {
    const { h, before } = shared.current();

    const message =
      h.providers
        .requests()
        .slice(before)
        .find((r) => r.context.agentTaskId === 'reader-003')?.messages[0]?.content ?? '';
    const block =
      /<<<ROSETTA-DATA \S+ \{[^\n]*"owner-answers"[^\n]*\}>>>\n([\s\S]*?)\n<<<END/u.exec(message);
    expect(block?.[1]).toContain(answer);
    expect(block?.[1]).not.toMatch(/\w:\d+-\d+/u);
  });

  it('DEC-198 rejects the claim that restates the answer on the context lines', async () => {
    const { h, deep } = shared.current();

    const claim = await claimOf(h, deep, 'BR-001.c3');
    expect(claim.status).toBe('Rejected');
    expect(claim.verdict?.reason).toContain("restates the owner's answer");
  });

  it('DEC-198 still judges the claim that cites a line of that range for what it shows', async () => {
    const { h, deep } = shared.current();

    expect(await claimOf(h, deep, 'BR-001.c2')).toMatchObject({ status: 'Supported' });
  });
});
