import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOverview } from '../../../src/application/overview/overview-file.js';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { deepenOf } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-264, P7-26: a Deepen that ends on its cap still writes its overview step, and "Write the
// overview" on it writes the overview alone: the Deepen is not resumed, no round starts.

const temp = useTempRoot('rosetta-deepen-overview-cap-');

const runCap =
  (maxTokens: number) =>
  (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxTokens } },
  });

async function overviewOf(h: UnderstandHarness, run: Run) {
  return parseOverview(await readFile(join(h.runFolder(run), 'overview.json'), 'utf8'));
}

async function capped() {
  // Three cards passed, so the overview is a call to the summariser, not a thin notice.
  const h = await createUnderstandHarness({
    ...{ dataDir: temp.path, recording: 'understand-overview.json' },
    verifierRecording: 'verifier-all-supported.json',
  });
  await h.scan();
  const run = await h.understand();
  await h.changeSettings(runCap(500));
  const deepen = await h.deepen(run);
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, deep: deepen.value };
}

describe('a Deepen that ends on its cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-264 P7-26 Recorded Deepen ends on cap has an overview that says the cap stopped it', async () => {
    const { h, deep } = await capped();

    expect(deep.endState).toBe('CapReached');
    const overview = await overviewOf(h, deep);
    expect(overview).toBeDefined();
    expect(overview?.state).toBe('unavailable');
    expect(overview?.notice).toContain('cap');
  });

  it('RF-264 P7-26 Write the overview does not resume the Deepen and writes the overview', async () => {
    const { h, deep } = await capped();
    await h.changeSettings(runCap(5_000_000));
    const calls = h.providers.requests().length;

    const written = await h.resume(deep, true);

    if (!written.ok) throw new Error(written.error);
    expect(written.value.endState).toBe('CapReached');
    const asked = h.providers
      .requests()
      .slice(calls)
      .map((r) => r.context.agentTaskId);
    expect(asked).toContain('summariser-overview');
    const roles = h.providers
      .requests()
      .slice(calls)
      .map((request) => request.context.role);
    expect(roles).not.toContain('reader');
    expect(roles).not.toContain('verifier');
    expect(await deepenOf(h, deep)).toMatchObject({ stopReason: 'capReached', roundsDone: 0 });
  });
});
