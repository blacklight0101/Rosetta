// RNF-004: run ids and every UUID come from this port (architecture section 7).
export interface IdGenerator {
  /** A run id in the form yyyyMMdd-HHmmss-<stage>, in UTC. */
  runId(stage: string): string;
  uuid(): string;
  /**
   * RF-145: a fresh data-block tag, 24 characters of lower-case base32 (a-z, 2-7) holding 120
   * random bits, never derived from content; every rendered data block gets its own.
   */
  dataBlockTag(): string;
}
