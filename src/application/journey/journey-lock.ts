// RF-435, P8-03: the free line of a journey is read, and the step that uses it is recorded, one start
// at a time for each project. One server holds the run queue (RF-1108), so a lock in the process is
// enough; without it two starts could read the same free line and both be given it.

const tails = new Map<string, Promise<unknown>>();

/** Runs `step` after every earlier step of the same project has finished, whatever its outcome. */
export async function withProjectLock<T>(projectId: string, step: () => Promise<T>): Promise<T> {
  const before = tails.get(projectId) ?? Promise.resolve();
  const run = before.then(step, step);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(projectId, tail);
  try {
    return await run;
  } finally {
    if (tails.get(projectId) === tail) tails.delete(projectId);
  }
}
