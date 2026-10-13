/**
 * A one-shot trap for `vi.mock('node:fs/promises')`: when the mocked function is called with
 * `path`, `action` runs once (the trap disarms itself before, so the action may use the file system
 * freely). The mock decides the order: spring the trap after the real call to change the file
 * between a check and its use, or before it to change the file the real call is about to open.
 * Makes a check-then-use race deterministic.
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
