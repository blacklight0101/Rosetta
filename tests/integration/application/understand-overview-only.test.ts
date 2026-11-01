import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOverview } from '../../../src/application/overview/overview-file.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-264, P7-26: "Write the overview" queues the run again and runs the overview step alone. The
// cards and their verdicts stay as they were, no reader or verifier is called, and the run ends as
// its cards say: CapReached while an area is unread, Completed when nothing is left.

const temp = useTempRoot('rosetta-understand-overview-only-');

/** Every card file of the run with its text: claims and verdicts included. */
async function cardsOf(folder: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  for (const type of await readdir(join(folder, 'cards'))) {
    if (!/^[A-Z]+$/u.test(type)) continue;
    for (const file of await readdir(join(folder, 'cards', type))) {
      found[`${type}/${file}`] = await readFile(join(folder, 'cards', type, file), 'utf8');
    }
  }
  return found;
}

const rolesOf = (h: UnderstandHarness): string[] =>
  h.providers.requests().map((request) => request.context.role);

async function overviewOf(h: UnderstandHarness, run: Run) {
  return parseOverview(await readFile(join(h.runFolder(run), 'overview.json'), 'utf8'));
}

describe('Write the overview on a run that ended on its cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-264 P7-26 keeps the cards and verdicts, calls no reader, and the run ends CapReached', async () => {
    const settings = understandSettings((base) => ({
      ...base,
      budget: {
        ...base.budget,
        run: { maxCostMicros: 50_000_000, maxTokens: 50_000_000 },
        roles: { reader: { maxTokens: 205_000 } },
      },
    }));
    const h = await createUnderstandHarness({
      ...{ dataDir: temp.path, recording: 'understand-cap.json', settings },
    });
    await h.scan();
    const run = await h.understand({ areas: ['Catalog', 'Services'] });
    expect(run.endState).toBe('CapReached');
    const before = await cardsOf(h.runFolder(run));
    const calls = rolesOf(h).length;

    const written = await h.resume(run, true);

    expect(written.ok && written.value.endState).toBe('CapReached');
    expect(await cardsOf(h.runFolder(run))).toEqual(before);
    expect(rolesOf(h).slice(calls)).not.toContain('reader');
    expect(rolesOf(h).slice(calls)).not.toContain('verifier');
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => task.state)).toEqual(['Done', 'Planned']);
  });
});

describe('Write the overview on a run whose overview call was refused', UNDERSTAND_TIMEOUT, () => {
  it('RF-264 P7-26 writes the overview of a Completed run and leaves its cards alone', async () => {
    const settings = understandSettings((base) => ({
      ...base,
      budget: { ...base.budget, roles: { summariser: { maxTokens: 1 } } },
    }));
    const h = await createUnderstandHarness({
      ...{ dataDir: temp.path, recording: 'understand-overview.json', settings },
      verifierRecording: 'verifier-all-supported.json',
    });
    await h.scan();
    const run = await h.understand();
    expect((await overviewOf(h, run))?.state).toBe('unavailable');
    const before = await cardsOf(h.runFolder(run));
    const calls = rolesOf(h).length;
    await h.changeSettings((current) => ({
      ...current,
      budget: { ...current.budget, roles: {} },
    }));

    const written = await h.resume(run, true);

    expect(written.ok && written.value.endState).toBe('Completed');
    expect((await overviewOf(h, run))?.state).toBe('full');
    expect(await cardsOf(h.runFolder(run))).toEqual(before);
    const added = rolesOf(h).slice(calls);
    expect(new Set(added)).toEqual(new Set(['summariser']));
    expect(h.providers.requests().at(-1)?.context.agentTaskId).toBe('summariser-overview');
  });
});
