import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { claimsOf, completedRun, deepenOf } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-429, DEC-193, EV-62: the claim-check (verifier) reserve comes out of the run cap. The verifier
// may use what is left of the run token cap after the readers' spend, minus the summariser's 10%, and
// the readers stop only when the run cap left cannot hold the judging of the claims they wrote.
// understand-claim-heavy.json: Catalog writes twelve claims and uses about 33,000 tokens; at a run
// cap of 100,000, twelve claims at the default estimate (24,000) fit beside it, where the fixed 20%
// share (20,000) stopped the readers. deepen-claim-heavy.json: the Deepen's verifier uses about 5,500
// tokens to judge its thirteen claims, more than a fifth of a 27,000 run cap (the shape of the eShop
// Deepen `4935508c`, which ended CapReached on the verifier's fixed share with cap left).

const temp = useTempRoot('rosetta-claim-check-reserve-');

function withRun(maxTokens: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens }, roles: {} },
  });
}

const readerTasks = (h: UnderstandHarness): string[] =>
  [...new Set(h.providers.requests().map((r) => r.context.agentTaskId))].filter((id) =>
    id.startsWith('reader-'),
  );

async function waiting(h: UnderstandHarness, run: Run): Promise<number> {
  const claims = await claimsOf(h, run);
  return claims.filter((c) => c.status === 'Proposed' || c.status === 'Unverified').length;
}

describe(
  'an understand run whose claims fit what is left of the run cap',
  UNDERSTAND_TIMEOUT,
  () => {
    it('RF-429 DEC-193 EV-62 the readers read on, every written claim is judged and the run Completes', async () => {
      const h = await createUnderstandHarness({
        dataDir: temp.path,
        recording: 'understand-claim-heavy.json',
        verifierRecording: 'verifier-all-supported.json',
        settings: understandSettings(withRun(100_000)),
      });
      await h.scan();

      const run = await h.understand({ areas: ['Catalog', 'Services'] });

      expect(run.endState).toBe('Completed');
      expect(readerTasks(h)).toEqual(['reader-001', 'reader-002']);
      const events = await h.eventsOf(run);
      expect(events.some((event) => event.type === 'budget.readersStopped')).toBe(false);
      expect(events.some((event) => event.type === 'budget.capReached')).toBe(false);
      expect(await waiting(h, run)).toBe(0);
    });
  },
);

describe(
  'a Deepen whose verifier needs more than a fifth of the run cap',
  UNDERSTAND_TIMEOUT,
  () => {
    it('RF-429 DEC-193 EV-62 does not end on a verifier reserve: every claim is judged and it Completes', async () => {
      const { h, run } = await completedRun({
        dataDir: temp.path,
        recording: 'deepen-claim-heavy.json',
        verifierRecording: 'verifier-deepen-claim-heavy.json',
      });
      await h.changeSettings(withRun(27_000));

      const result = await h.deepen(run, { maxRounds: 3 });

      if (!result.ok) throw new Error(result.error);
      const deep = result.value;
      expect(deep.endState).toBe('Completed');
      const events = await h.eventsOf(deep);
      expect(events.filter((event) => event.type === 'budget.capReached')).toEqual([]);
      expect(await waiting(h, deep)).toBe(0);
      expect((await deepenOf(h, deep)).stopReason).not.toBe('capReached');
    });
  },
);
