import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardFiles } from '../../support/consolidate-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-429, RF-250, RF-264, RF-304, P3-121 (HB-03, HB-11): the verifier of a run takes a share of the
// run token cap, not what the readers left. The recording understand-consolidate.json has five
// claims and duplicate cards; verifier-heavy-supported.json judges each claim with 6,000 input
// tokens. At a run cap of 42,000 tokens the readers use 9,820 and the five verdicts would use
// everything else, so the summariser, which merges the duplicates and writes the overview, was
// refused. Now the verifier stops at its share and the summariser still runs.

const temp = useTempRoot('rosetta-understand-verifier-reserve-');

const tight = understandSettings((settings) => ({
  ...settings,
  budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens: 42_000 } },
}));

async function tightRun() {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-consolidate.json',
    verifierRecording: 'verifier-heavy-supported.json',
    settings: tight,
  });
  await h.scan();
  const run = await h.understand({});
  return { h, run, folder: h.runFolder(run) };
}

describe(
  'an understand run whose verifier would use the whole rest of the run cap',
  UNDERSTAND_TIMEOUT,
  () => {
    it('RF-429 the verifier stops at its share, and the claims it did not judge are Unverified', async () => {
      const { h, run } = await tightRun();

      const events = await h.eventsOf(run);
      const caps = events.filter((event) => event.type === 'budget.capReached');
      expect(caps.map((event) => event.data)).toMatchObject([
        { scope: 'role-tokens', role: 'verifier', capSource: 'reserve' },
      ]);
      const ended = events.find((event) => event.type === 'verify.judgement.ended');
      expect(ended?.data).toMatchObject({ notJudged: 0 });
      expect(ended?.data['unverified']).toBeGreaterThan(0);
    });

    it('RF-250 RF-429 the summariser still merges the duplicate cards after the verifier', async () => {
      const { h, folder } = await tightRun();

      expect(await cardFiles(folder, 'BR')).toEqual(['BR-001.md']);
      expect(await cardFiles(folder, 'ENT')).toEqual(['ENT-001.md']);
      const roles = h.providers.requests().map((request) => request.context.role);
      expect(roles.filter((role) => role === 'summariser')).toHaveLength(2);
    });

    it('RF-264 RF-429 the run has an overview, not the unavailable stub', async () => {
      const { folder } = await tightRun();

      const overview = JSON.parse(await readFile(join(folder, 'overview.json'), 'utf8')) as {
        readonly state: string;
      };
      expect(overview.state).not.toBe('unavailable');
    });

    it('RF-429 RF-006 the run ends CapReached, so it can be resumed to judge the rest', async () => {
      const { run } = await tightRun();

      expect(run.endState).toBe('CapReached');
    });
  },
);
