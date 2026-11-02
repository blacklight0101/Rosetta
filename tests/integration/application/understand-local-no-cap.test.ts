import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-433, DEC-197, EV-62: with the fake provider (a local kind, priced at zero), a run whose every
// role is local goes past its token cap and its approved amount without a pause when the project
// turned "No cap for local models" on; with the setting off it stops at the cap and pauses at the
// approved amount as before (RF-422, RF-432).

const temp = useTempRoot('rosetta-understand-local-no-cap-');
const areas = ['Catalog', 'Services'];

// As in understand-approval-pause.test.ts: the reader tasks and the claim fit 228,000 tokens; the
// verifier's first call (worst case 32,768 tokens) does not.
function settingsOf(maxTokens: number, noCapForLocalModels: boolean): ProjectSettings {
  return understandSettings((settings) => ({
    ...settings,
    roles: { ...settings.roles, verifier: { ...settings.roles.verifier, maxOutputTokens: 32_768 } },
    budget: {
      ...settings.budget,
      run: { maxCostMicros: 50_000_000, maxTokens },
      noCapForLocalModels,
    },
  }));
}
const approvedAmount = { tokens: 228_000, costMicros: 500_000 };

async function harnessWith(settings: ProjectSettings): Promise<UnderstandHarness> {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-resume.json',
    settings,
    verifierRecording: 'verifier-all-supported.json',
  });
  await h.scan();
  return h;
}

describe('RF-433 a run on local providers only', UNDERSTAND_TIMEOUT, () => {
  it('RF-433 goes past the token cap to Completed when the setting is on', async () => {
    const h = await harnessWith(settingsOf(228_000, true));

    const run = await h.understand({ areas });

    expect(run).toMatchObject({ endState: 'Completed', queueState: 'Ended' });
  });

  it('RF-433 still ends CapReached at the token cap when the setting is off', async () => {
    const h = await harnessWith(settingsOf(228_000, false));

    const run = await h.understand({ areas });

    expect(run.endState).toBe('CapReached');
  });

  it('RF-433 does not pause at the approved amount when the setting is on', async () => {
    const h = await harnessWith(settingsOf(5_000_000, true));

    const run = await h.understand({ areas, approvedAmount });

    expect(run).toMatchObject({ endState: 'Completed', queueState: 'Ended' });
    const types = (await h.eventsOf(run)).map((event) => event.type);
    expect(types).not.toContain('run.awaitingApproval');
  });

  it('RF-433 pauses at the approved amount (RF-432) when the setting is off', async () => {
    const h = await harnessWith(settingsOf(5_000_000, false));

    const run = await h.understand({ areas, approvedAmount });

    expect(run).toMatchObject({ queueState: 'AwaitingApproval', endState: null });
  });
});
