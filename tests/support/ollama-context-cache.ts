import type { ContextCache } from '../../src/infrastructure/providers/ollama/ollama-context-resolver.js';

// RF-401, DEC-114: a test-only reset of an Ollama context cache. It lives under tests/support so
// that production code cannot empty the process-wide cache (P1-111).

/** Forgets every measurement, so a test harness starts each test from an empty cache. */
export function clearContextCache(cache: ContextCache): void {
  cache.auto.clear();
  cache.retryAt.clear();
  cache.fixedChecked.clear();
}
