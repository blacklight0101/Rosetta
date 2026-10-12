import type { Logger } from '../application/ports/logger.js';

/** Placeholder until P1-68 is implemented. */
export function closePool(pool: { end(): Promise<void> }, _logger: Logger): Promise<void> {
  return pool.end();
}
