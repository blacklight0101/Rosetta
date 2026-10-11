import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

/** Registers hooks that give each test a fresh temporary folder; read it with `.path`. */
export function useTempRoot(prefix: string): { readonly path: string } {
  const state = { path: '' };

  beforeEach(async () => {
    state.path = await mkdtemp(join(tmpdir(), prefix));
  });

  afterEach(async () => {
    await rm(state.path, { recursive: true, force: true });
  });

  return state;
}
