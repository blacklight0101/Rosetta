// RF-1302: the start-up order. Pending migrations are applied before the server accepts requests;
// provider keys sealed under ROSETTA_SECRET_KEY_PREVIOUS are re-encrypted under the current key
// (RF-1104, DEC-112); then the bootstrap administrator is created (RF-1102); runs left running by
// the earlier process end as interrupted, and partial snapshot folders are discarded, before the
// server accepts requests (RF-1108, RNF-002, RF-122);
// the scheduled jobs start only once the server listens. A failing step stops the start-up.

export interface StartUpSteps {
  readonly migrate: () => Promise<void>;
  readonly reEncryptKeys: () => Promise<void>;
  readonly bootstrapAdmin: () => Promise<void>;
  readonly recoverRuns: () => Promise<void>;
  readonly listen: () => Promise<void>;
  readonly startScheduler: () => void;
}

// RF-1302, RF-1104, RF-1102, RF-1108
export async function startUp(steps: StartUpSteps): Promise<void> {
  await steps.migrate();
  await steps.reEncryptKeys();
  await steps.bootstrapAdmin();
  await steps.recoverRuns();
  await steps.listen();
  steps.startScheduler();
}
