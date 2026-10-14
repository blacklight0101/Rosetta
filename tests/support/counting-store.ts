// A store that counts every method call made on it, for tests that bound how often a use case reads.

export interface CallCount {
  calls: number;
}

/** The same store, counting each method call into `count`. */
export function counting<T extends object>(store: T, count: CallCount): T {
  return new Proxy(store, {
    get(target, key) {
      const member: unknown = Reflect.get(target, key);
      if (typeof member !== 'function') return member;
      return (...args: unknown[]): unknown => {
        count.calls += 1;
        const result: unknown = Reflect.apply(member, target, args);
        return result;
      };
    },
  });
}
