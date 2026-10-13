import { randomUUID } from 'node:crypto';

// P1-150: every run takes a caps lock folder of its own (caps-lock.ts). The key is set before the
// workers start, so they inherit it; a run killed while it held the lock cannot make the next wait.
export default function globalSetup(): void {
  process.env['ROSETTA_E2E_RUN_KEY'] = randomUUID();
}
