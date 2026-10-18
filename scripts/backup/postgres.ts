// RF-1306, RNF-003: runs pg_dump, pg_restore and psql without a shell. The password travels only
// in the environment of the child process, never in its arguments, and every message is redacted.
import { spawn } from 'node:child_process';
import { open, type FileHandle } from 'node:fs/promises';

export interface Connection {
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

export interface Invocation {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface ToolOptions {
  readonly url: string;
  readonly container?: string | undefined;
  readonly tool: string;
  readonly args: readonly string[];
}

export interface RunOptions {
  readonly invocation: Invocation;
  readonly secrets: readonly string[];
  readonly stdin?: string | undefined;
  readonly stdout?: string | undefined;
}

export function parseDatabaseUrl(url: string): Connection {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port === '' ? '5432' : parsed.port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
  };
}

export function redact(text: string, secrets: readonly string[]): string {
  let result = text.replace(/(:\/\/[^:/@\s]*:)[^@\s]+@/gu, '$1[redacted]@');
  for (const secret of secrets) {
    if (secret !== '') result = result.split(secret).join('[redacted]');
  }
  return result;
}

/** The process to start for a PostgreSQL tool: on the host, or inside a container with docker exec. */
export function buildInvocation({ url, container, tool, args }: ToolOptions): Invocation {
  const connection = parseDatabaseUrl(url);
  const target = ['-U', connection.user, '-d', connection.database];
  const env = { PGPASSWORD: connection.password };
  if (container !== undefined) {
    // `-e PGPASSWORD` copies the value from this process's environment; it is not in the arguments.
    return {
      file: 'docker',
      args: ['exec', '-i', '-e', 'PGPASSWORD', container, tool, ...target, ...args],
      env,
    };
  }
  return {
    file: tool,
    args: [...target, ...args],
    env: { ...env, PGHOST: connection.host, PGPORT: connection.port },
  };
}

function openOrUndefined(
  path: string | undefined,
  flags: 'r' | 'w',
): Promise<FileHandle | undefined> {
  return path === undefined ? Promise.resolve(undefined) : open(path, flags);
}

function exitCodeOf(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
}

/**
 * Runs a tool and returns what it prints; `stdin` and `stdout` are files streamed to and from it.
 * A failure rejects with the exit code and the redacted error output.
 */
export async function runTool({ invocation, secrets, stdin, stdout }: RunOptions): Promise<string> {
  const input = await openOrUndefined(stdin, 'r');
  const output = await openOrUndefined(stdout, 'w');
  try {
    const child = spawn(invocation.file, [...invocation.args], {
      env: { ...process.env, ...invocation.env },
      stdio: [input?.fd ?? 'ignore', output?.fd ?? 'pipe', 'pipe'],
      windowsHide: true,
    });
    let printed = '';
    let complained = '';
    child.stdout?.on('data', (chunk: Buffer) => (printed += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (complained += chunk.toString()));
    const code = await exitCodeOf(child).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'unknown error';
      throw new Error(redact(`${invocation.file} could not start: ${reason}`, secrets), {
        cause: error,
      });
    });
    if (code !== 0) {
      const detail = redact(complained.trim(), secrets);
      throw new Error(`${invocation.file} failed with exit code ${String(code)}: ${detail}`);
    }
    return printed;
  } finally {
    await input?.close();
    await output?.close();
  }
}
