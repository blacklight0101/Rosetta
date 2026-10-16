// RF-1302: the start-up order. The schema is checked first: the one-off migrate step must have
// applied every migration (DEC-140; the server never migrates and refuses a pending one);
// provider keys sealed under ROSETTA_SECRET_KEY_PREVIOUS are re-encrypted under the current key
// (RF-1104, DEC-112); then the bootstrap administrator is created (RF-1102); runs left running by
// the earlier process end as interrupted before the server accepts requests (RF-1108, RNF-002); partial
// snapshot folders are discarded once, just before that and before the queue accepts runs, never by
// the periodic queue sweep, which would delete a download running at that moment (RF-122);
// the scheduled jobs start only once the server listens. A failing step stops the start-up.

export interface StartUpSteps {
  readonly checkSchema: () => Promise<void>;
  readonly reEncryptKeys: () => Promise<void>;
  readonly bootstrapAdmin: () => Promise<void>;
  readonly discardPartialSnapshots: () => Promise<void>;
  readonly recoverRuns: () => Promise<void>;
  readonly listen: () => Promise<void>;
  readonly startScheduler: () => void;
}

// RF-1302, RF-1104, RF-1102, RF-1108, RF-122
export async function startUp(steps: StartUpSteps): Promise<void> {
  await steps.checkSchema();
  await steps.reEncryptKeys();
  await steps.bootstrapAdmin();
  await steps.discardPartialSnapshots();
  await steps.recoverRuns();
  await steps.listen();
  steps.startScheduler();
}
