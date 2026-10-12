// RF-1302: the start-up order. Pending migrations are applied before the server accepts requests;
// then the bootstrap administrator is created (RF-1102); runs left running by the earlier process end
// as interrupted before the server accepts requests (RF-1108, RNF-002); the scheduled jobs start only
// once the server listens. A failing step stops the start-up.

export interface StartUpSteps {
  readonly migrate: () => Promise<void>;
  readonly bootstrapAdmin: () => Promise<void>;
  readonly recoverRuns: () => Promise<void>;
  readonly listen: () => Promise<void>;
  readonly startScheduler: () => void;
}

// RF-1302, RF-1102, RF-1108
export async function startUp(steps: StartUpSteps): Promise<void> {
  await steps.migrate();
  await steps.bootstrapAdmin();
  await steps.recoverRuns();
  await steps.listen();
  steps.startScheduler();
}
