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
