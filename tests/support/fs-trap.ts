/**
 * A one-shot trap for `vi.mock('node:fs/promises')`: when the mocked function is called with
 * `path`, the real call runs first, then `action` runs once (the trap disarms itself before, so the
 * action may use the file system freely). Makes a check-then-use race deterministic.
 */
export interface FsTrap {
  path: string | undefined;
  action: (() => Promise<void>) | undefined;
}

export function armTrap(trap: FsTrap, path: string, action: () => Promise<void>): void {
  trap.path = path;
  trap.action = action;
}

/** Runs the armed action when `path` is the trapped path; a no-op otherwise. */
export async function springTrap(trap: FsTrap, path: unknown): Promise<void> {
  if (trap.path === undefined || path !== trap.path) return;
  const { action } = trap;
  trap.path = undefined;
  trap.action = undefined;
  await action?.();
}
