// RF-1100: runs tasks with the same key one after another, in arrival order; tasks with different
// keys run independently. Sign-in uses it per user name, so the failure count of an account is
// read and written by one attempt at a time (one server instance, DEC-112). A key is forgotten
// once its last task has settled, so the map never outgrows the attempts in flight.
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>();

  // RF-1100
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  /** The number of keys with a task waiting or running. */
  get size(): number {
    return this.tails.size;
  }
}
