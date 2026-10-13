// P1-131: placeholder, replaced by the lock.
export interface CapsLock {
  readonly waitedMs: number;
  release(): Promise<void>;
}

export function acquireCapsLock(
  _folder: string,
  _options?: { staleAfterMs?: number },
): Promise<CapsLock> {
  return Promise.reject(new Error('not implemented'));
}
