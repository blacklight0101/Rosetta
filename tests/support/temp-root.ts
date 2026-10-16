import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

/**
 * Registers hooks that give each test a fresh temporary folder; read it with `.path`. The path is
 * the real one (no 8.3 short names such as `RUNNER~1`, no links), so it compares equal to the paths
 * the adapters build from `realpath`.
 */
export function useTempRoot(prefix: string): { readonly path: string } {
  const state = { path: '' };

  beforeEach(async () => {
    state.path = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  });

  afterEach(async () => {
    await rm(state.path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  return state;
}
