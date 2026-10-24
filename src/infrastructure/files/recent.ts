// P5-22, P5-28: a bounded map that forgets the least recently used entry first.

/** The least recently used entries first; reading an entry moves it to the end. */
export class Recent<T> {
  readonly #entries = new Map<string, T>();
  readonly #most: number;

  constructor(most: number) {
    this.#most = Math.max(1, most);
  }

  get(key: string): T | undefined {
    const found = this.#entries.get(key);
    if (found === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, found);
    return found;
  }

  set(key: string, value: T): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    for (const oldest of this.#entries.keys()) {
      if (this.#entries.size <= this.#most) break;
      this.#entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }
}
