import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext } from '@playwright/test';
import { z } from 'zod';
import { clientAddressFor } from './client-address.js';
import { ensureAccount, type Credentials } from './seed.js';
import { e2eOrigin, e2ePort } from './server-config.js';

// RF-1100, RF-1009: a browser context signed in through the API, as a person would through the
// sign-in page. The server limits sign-ins to 10 a minute per address, and Playwright starts a new
// worker after every failed test (including the expected failures of the harness spec), so the
// cookies of each account are kept in a folder of this run that every worker reads: an account
// signs in once per run, not once per worker. The test server empties the folder when it starts.

export { seededAdmin, seededUser } from './seed.js';

const cookie = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number(),
  httpOnly: z.boolean(),
  secure: z.boolean(),
  sameSite: z.enum(['Strict', 'Lax', 'None']),
});
const cookieList = z.array(cookie);

type Cookies = z.output<typeof cookieList>;

/** The folder of this run's kept sessions (one run per port). */
function sessionFolder(): string {
  return join(tmpdir(), `rosetta-e2e-sessions-${String(e2ePort())}`);
}

/** Removes the kept sessions of an earlier run on this port. */
export async function clearSessions(): Promise<void> {
  await rm(sessionFolder(), { recursive: true, force: true });
}

function sessionFile(userName: string): string {
  return join(sessionFolder(), `${userName}.json`);
}

async function keptCookies(userName: string): Promise<Cookies | undefined> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(sessionFile(userName), 'utf8'));
  } catch {
    // No worker has signed this account in yet (the file is renamed into place when complete).
    return undefined;
  }
  const parsed = cookieList.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

async function openSession(context: BrowserContext, credentials: Credentials): Promise<Cookies> {
  const response = await context.request.post('/api/session', {
    data: { userName: credentials.userName, password: credentials.password },
    headers: {
      origin: e2eOrigin(),
      'x-forwarded-for': clientAddressFor(`sign-in:${credentials.userName}`),
    },
  });
  if (!response.ok()) {
    throw new Error(`Sign-in of ${credentials.userName} answered ${String(response.status())}`);
  }
  return cookieList.parse(await context.cookies());
}

/** Opens a session for the account in the context; its cookies then apply to pages and requests. */
// RF-1100
export async function signInAs(context: BrowserContext, credentials: Credentials): Promise<void> {
  await ensureAccount(credentials);
  const known = await keptCookies(credentials.userName);
  if (known !== undefined) {
    await context.addCookies(known);
    return;
  }
  const cookies = await openSession(context, credentials);
  const file = sessionFile(credentials.userName);
  const partial = `${file}.${String(process.pid)}.partial`;
  await mkdir(sessionFolder(), { recursive: true });
  await writeFile(partial, JSON.stringify(cookies), 'utf8');
  await rename(partial, file);
}
