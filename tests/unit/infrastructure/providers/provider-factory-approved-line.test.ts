import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import {
  factoryHarness,
  serverKeyText,
  settingsFor,
  type FactoryHarnessOptions,
} from '../../../support/provider-factory-harness.js';

// RF-432, RF-1106, P8-03: the readers' room check pauses the run only when the cap that binds it is
// the amount the owner approved; where an administrator ceiling binds, the readers just stop (the
// budget guard decides per cap source in the same way).

const openAi = settingsFor({ reader: { provider: 'openai', model: 'contract-model' } });
const approvedAmount = { tokens: 1_000_000, costMicros: 2_000_000 };

async function readerCaps(options: FactoryHarnessOptions, settings: ProjectSettings = openAi) {
  const harness = factoryHarness(options);
  const built = await harness.factory.build(
    harness.request({ roles: ['reader'], settings, cloudConsent: true, approvedAmount }),
  );
  return built.ok ? built.value.get('reader')?.runCaps : undefined;
}

describe('RF-432 the run cap the readers are held to', () => {
  it('RF-432 P8-03 is marked approved when the approved amount binds the run', async () => {
    const caps = {
      runMicros: 50_000_000n,
      userDayMicros: 90_000_000n,
      serverMonthMicros: 99_000_000n,
    };

    const runCaps = await readerCaps({ serverKeys: { openai: serverKeyText }, caps });

    expect(runCaps).toMatchObject({ approved: true, micros: 2_000_000n });
  });

  it('RF-432 P8-03 is not approved when the administrator run cap, lowered after approval, binds', async () => {
    const caps = {
      runMicros: 500_000n,
      userDayMicros: 90_000_000n,
      serverMonthMicros: 99_000_000n,
    };

    const runCaps = await readerCaps({ serverKeys: { openai: serverKeyText }, caps });

    expect(runCaps?.micros).toBe(500_000n);
    expect(runCaps?.approved).toBeUndefined();
  });

  it('RF-432 P8-03 is not approved when the administrator cap only equals the approved cost: that cap is the hard stop', async () => {
    const caps = {
      runMicros: 2_000_000n,
      userDayMicros: 90_000_000n,
      serverMonthMicros: 99_000_000n,
    };

    const runCaps = await readerCaps({ serverKeys: { openai: serverKeyText }, caps });

    expect(runCaps?.approved).toBeUndefined();
  });
});
