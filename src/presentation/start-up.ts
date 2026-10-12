// RF-1302: the start-up order. Pending migrations are applied before the server accepts requests;
// then the bootstrap administrator is created (RF-1102); the scheduled jobs start only once the
// server listens. A failing step stops the start-up.

export interface StartUpSteps {
  readonly migrate: () => Promise<void>;
  readonly bootstrapAdmin: () => Promise<void>;
  readonly listen: () => Promise<void>;
  readonly startScheduler: () => void;
}

// RF-1302, RF-1102
export async function startUp(steps: StartUpSteps): Promise<void> {
  await steps.migrate();
  await steps.bootstrapAdmin();
  await steps.listen();
  steps.startScheduler();
}
