import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { describe, expect, it } from 'vitest';

// RF-1302, ADR-014, P1-68: SIGTERM ends the process within the shutdown deadline (5 s) plus a
// margin although the database accepts connections and never answers. Node ends a process at once
// on a signal on Windows, where no handler runs, so the test runs where the image runs (Linux).

const marginMs = 3_000;
const deadlineMs = 5_000;
const testTimeoutMs = 30_000;

async function frozenDatabase(): Promise<{
  readonly port: number;
  readonly connected: Promise<void>;
  readonly close: () => void;
}> {
  const sockets: Socket[] = [];
  let connect: () => void = () => undefined;
  const connected = new Promise<void>((resolve) => {
    connect = resolve;
  });
  const server = createServer((socket) => {
    sockets.push(socket);
    socket.on('error', () => undefined);
    connect();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No TCP address.');
  return {
    port: address.port,
    connected,
    close: () => {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}

describe.skipIf(process.platform === 'win32')('shutdown with a frozen database', () => {
  it(
    'RF-1302 SIGTERM ends the process within the deadline plus a margin, with exit code 1',
    async () => {
      const database = await frozenDatabase();
      const child = spawn(
        process.execPath,
        ['--import', './scripts/register-ts.mjs', 'tests/support/frozen-database-harness.ts'],
        {
          env: {
            ...process.env,
            FROZEN_DATABASE_URL: `postgres://rosetta_app:secret@127.0.0.1:${String(database.port)}/rosetta`,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
        child.once('exit', (code, signal) => {
          resolve({ code, signal });
        });
      });

      try {
        await database.connected;
        const signalled = Date.now();
        child.kill('SIGTERM');
        const result = await exited;
        const elapsed = Date.now() - signalled;

        expect(result).toEqual({ code: 1, signal: null });
        expect(elapsed).toBeGreaterThanOrEqual(deadlineMs - 100);
        expect(elapsed).toBeLessThan(deadlineMs + marginMs);
        expect(output).toContain('Shutdown did not finish within 5000 ms');
      } finally {
        child.kill('SIGKILL');
        database.close();
      }
    },
    testTimeoutMs,
  );
});
