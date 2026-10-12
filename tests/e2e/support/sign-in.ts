import type { BrowserContext } from '@playwright/test';
import { e2eOrigin } from './server-config.js';

// RF-1100, RF-1009: a browser context signed in through the API, as a person would through the
// sign-in page. The server limits sign-ins to 10 a minute per address, so a worker signs in once
// per account and reuses the cookies for its other tests.

export { seededAdmin } from './seed.js';

export interface Credentials {
  readonly userName: string;
  readonly password: string;
}

type Cookies = Awaited<ReturnType<BrowserContext['cookies']>>;

const cookiesByUser = new Map<string, Cookies>();

async function openSession(context: BrowserContext, credentials: Credentials): Promise<Cookies> {
  const response = await context.request.post('/api/session', {
    data: { userName: credentials.userName, password: credentials.password },
    headers: { origin: e2eOrigin() },
  });
  if (!response.ok()) {
    throw new Error(`Sign-in of ${credentials.userName} answered ${String(response.status())}`);
  }
  return await context.cookies();
}

/** Opens a session for the account in the context; its cookies then apply to pages and requests. */
// RF-1100
export async function signInAs(context: BrowserContext, credentials: Credentials): Promise<void> {
  const known = cookiesByUser.get(credentials.userName);
  if (known !== undefined) {
    await context.addCookies(known);
    return;
  }
  cookiesByUser.set(credentials.userName, await openSession(context, credentials));
}
