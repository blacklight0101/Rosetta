import { describe, expect, it } from 'vitest';
import {
  buildInvocation,
  parseDatabaseUrl,
  redact,
  runTool,
} from '../../../scripts/backup/postgres.js';

const secret = ['sentinel', 'value', String(0x5eed0123)].join('-');
const url = `postgres://postgres:${secret}@127.0.0.1:57613/rosetta`;

describe('backup postgres tools', () => {
  it('RF-1306 reads the connection from a database URL', () => {
    expect(parseDatabaseUrl(url)).toEqual({
      host: '127.0.0.1',
      port: '57613',
      user: 'postgres',
      password: secret,
      database: 'rosetta',
    });
    expect(parseDatabaseUrl('postgres://u%40x:p%2Fw@db/rosetta')).toMatchObject({
      user: 'u@x',
      password: 'p/w',
      port: '5432',
    });
  });

  it('RF-1306 passes the password in the environment only, never in the arguments', () => {
    for (const container of [undefined, 'rosetta-p212-db-1']) {
      const call = buildInvocation({ url, container, tool: 'pg_dump', args: ['--format=custom'] });
      expect(call.args.join(' ')).not.toContain(secret);
      expect(call.file).not.toContain(secret);
      expect(call.env['PGPASSWORD']).toBe(secret);
    }
  });

  it('RF-1306 runs the tool inside a container with docker exec when one is named', () => {
    const direct = buildInvocation({ url, tool: 'pg_dump', args: ['--format=custom'] });
    expect(direct.file).toBe('pg_dump');
    expect(direct.env['PGHOST']).toBe('127.0.0.1');
    const inside = buildInvocation({ url, container: 'c1', tool: 'pg_dump', args: ['-x'] });
    expect(inside.file).toBe('docker');
    expect(inside.args.slice(0, 5)).toEqual(['exec', '-i', '-e', 'PGPASSWORD', 'c1']);
    expect(inside.args).toContain('pg_dump');
    expect(inside.args).toContain('-x');
  });
});

describe('backup postgres redaction', () => {
  it('RF-1306 redacts a secret and a URL password from a message', () => {
    expect(redact(`failed for ${secret} twice ${secret}`, [secret])).toBe(
      'failed for [redacted] twice [redacted]',
    );
    expect(redact('connect postgres://u:pw123@h/db failed', [])).toBe(
      'connect postgres://u:[redacted]@h/db failed',
    );
  });

  it('RF-1306 keeps the secret out of the error of a failing tool', async () => {
    const script =
      'console.error("password " + process.env.PGPASSWORD + " rejected"); process.exit(3)';
    const invocation = {
      file: process.execPath,
      args: ['-e', script],
      env: { PGPASSWORD: secret },
    };
    const failure = await runTool({ invocation, secrets: [secret] }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const message = failure instanceof Error ? failure.message : '';
    expect(message).toContain('rejected');
    expect(message).toContain('exit code 3');
    expect(message).not.toContain(secret);
  });

  it('RF-1306 returns what a tool prints', async () => {
    const invocation = { file: process.execPath, args: ['-e', 'console.log("42")'], env: {} };
    expect((await runTool({ invocation, secrets: [] })).trim()).toBe('42');
  });
});
