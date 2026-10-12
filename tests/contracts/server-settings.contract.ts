import { expect, it } from 'vitest';
import type { DefaultRoles } from '../../src/application/projects/default-roles.js';
import type { ServerSettings } from '../../src/application/ports/server-settings.js';

// Architecture section 7, DEC-106: every ServerSettings adapter (PgServerSettings,
// MemoryServerSettings) passes this suite. `defaultRoles` is empty until the administrator sets it.

/** A server whose `defaultRoles` setting holds the given value, as the administrator saved it. */
export type ServerSettingsWith = (defaultRoles: DefaultRoles) => Promise<ServerSettings>;

export function serverSettingsContract(name: string, withRoles: ServerSettingsWith): void {
  it(`DEC-106 ${name} reads an empty defaultRoles as no default models`, async () => {
    const settings = await withRoles({});

    expect(await settings.defaultRoles()).toEqual({});
  });

  it(`DEC-106 ${name} reads the provider and model the administrator set per role`, async () => {
    const roles: DefaultRoles = {
      reader: { provider: 'ollama', model: 'gemma4:e4b' },
      verifier: { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' },
    };
    const settings = await withRoles(roles);

    expect(await settings.defaultRoles()).toEqual(roles);
  });
}

/** RF-1106, DEC-107: the caps the administrator keeps; defaults $0.50, $1.00 and $10.00. */
export function serverCapsContract(name: string, fresh: () => Promise<ServerSettings>): void {
  const by = '00000000-0000-4000-9000-0000000000ad';
  const at = new Date('2026-10-12T10:00:00.000Z');

  it(`RF-1106 ${name} starts with the default caps`, async () => {
    const settings = await fresh();

    expect(await settings.caps()).toEqual({
      runMicros: 500_000n,
      userDayMicros: 1_000_000n,
      serverMonthMicros: 10_000_000n,
    });
  });

  it(`RF-1106 ${name} keeps the caps the administrator saves, beyond the float range`, async () => {
    const settings = await fresh();
    const caps = { runMicros: 0n, userDayMicros: 9_007_199_254_740_993n, serverMonthMicros: 7n };

    await settings.saveCaps(caps, { by, at });

    expect(await settings.caps()).toEqual(caps);
    expect(await settings.defaultRoles()).toEqual({});
  });
}
