import { expect, it } from 'vitest';
import type { ProjectConsents } from '../../src/application/ports/project-consents.js';
import type { ProjectConsent } from '../../src/domain/consent/project-consent.js';

// Architecture section 7, RF-143, RF-142, RF-1105, DEC-209: every ProjectConsents adapter
// (PgProjectConsents, MemoryProjectConsents) passes this suite. The fresh store knows the project
// `project`, owned by `amy`; `bob` is another user. Generated test data only.

export const consentOwners = {
  amy: '00000000-0000-4000-9000-0000000000a1',
  bob: '00000000-0000-4000-9000-0000000000b1',
  project: '00000000-0000-4000-a000-0000000000a1',
} as const;

const { amy, bob, project } = consentOwners;

function consent(id: string, overrides: Partial<ProjectConsent> = {}): ProjectConsent {
  return {
    id,
    userId: amy,
    projectId: project,
    providers: ['anthropic'],
    kinds: ['cloud'],
    givenAt: 1_800_000_000_000,
    withdrawnAt: null,
    ...overrides,
  };
}

const first = '00000000-0000-4000-c000-000000000001';
const second = '00000000-0000-4000-c000-000000000002';

export function projectConsentsContract(name: string, fresh: () => Promise<ProjectConsents>): void {
  it(`RF-143 ${name} lists no consent for a project that has none`, async () => {
    const consents = await fresh();

    expect(await consents.list(amy, project)).toEqual([]);
  });

  it(`RF-143 ${name} keeps the providers, kinds and given time of a consent, not withdrawn`, async () => {
    const consents = await fresh();
    const given = consent(first, {
      providers: ['anthropic', 'openai'],
      kinds: ['cloud', 'private-code'],
      withdrawnAt: 1_900_000_000_000,
    });

    await consents.give(given);

    expect(await consents.list(amy, project)).toEqual([{ ...given, withdrawnAt: null }]);
  });

  it(`RF-1105 ${name} refuses a consent on another user's project and stores nothing`, async () => {
    const consents = await fresh();

    await expect(consents.give(consent(first, { userId: bob }))).rejects.toMatchObject({
      code: 'RST-2003',
    });
    expect(await consents.list(amy, project)).toEqual([]);
    expect(await consents.list(bob, project)).toEqual([]);
  });

  it(`RF-142 ${name} refuses a consent whose id is already stored and keeps the first`, async () => {
    const consents = await fresh();
    await consents.give(consent(first));

    await expect(
      consents.give(consent(first, { providers: ['openai'], givenAt: 1_800_000_500_000 })),
    ).rejects.toMatchObject({ code: 'RST-2404' });
    expect(await consents.list(amy, project)).toEqual([consent(first)]);
  });

  it(`RF-1105 ${name} lists nothing for another user's project`, async () => {
    const consents = await fresh();
    await consents.give(consent(first));

    expect(await consents.list(bob, project)).toEqual([]);
  });
}

/** RF-143, RF-142: a withdrawal keeps the row and gains its time; only the owner withdraws. */
export function projectConsentWithdrawalContract(
  name: string,
  fresh: () => Promise<ProjectConsents>,
): void {
  it(`RF-143 ${name} keeps a withdrawn consent with the time it was withdrawn`, async () => {
    const consents = await fresh();
    await consents.give(consent(first));

    expect(await consents.withdraw(amy, project, 1_800_000_500_000)).toBe(1);
    expect(await consents.withdraw(amy, project, 1_800_000_900_000)).toBe(0);

    expect(await consents.list(amy, project)).toEqual([
      consent(first, { withdrawnAt: 1_800_000_500_000 }),
    ]);
  });

  it(`RF-1105 ${name} never withdraws a consent of another user's project`, async () => {
    const consents = await fresh();
    await consents.give(consent(first));

    expect(await consents.withdraw(bob, project, 1_800_000_500_000)).toBe(0);
    expect(await consents.list(amy, project)).toEqual([consent(first)]);
  });

  it(`RF-142 ${name} lists the consents of a project newest first, the withdrawn ones kept`, async () => {
    const consents = await fresh();
    await consents.give(consent(first, { givenAt: 1_800_000_000_000 }));
    await consents.withdraw(amy, project, 1_800_000_100_000);
    await consents.give(
      consent(second, { givenAt: 1_800_000_200_000, providers: ['ollama'], kinds: ['cloud'] }),
    );

    expect(await consents.list(amy, project)).toEqual([
      consent(second, { givenAt: 1_800_000_200_000, providers: ['ollama'] }),
      consent(first, { withdrawnAt: 1_800_000_100_000 }),
    ]);
  });
}
