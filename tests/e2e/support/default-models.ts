import type { BrowserContext, Page } from '@playwright/test';
import { z } from 'zod';
import { acquireCapsLock, capsLockFolder } from './caps-lock.js';
import { e2eOrigin } from './server-config.js';

// DEC-106, RF-405, P3-77: the default models are one server setting, shared by every worker of a
// run, and the page asks the server for the Ollama list when it loads. A spec that changes the
// setting takes the turn of the server-wide settings (the lock of the caps), starts from an empty
// setting and gives it back empty, so a test never loads a page that already fetches a list, and
// two repeats of the spec never write the setting at the same time. The Ollama answer is set on the
// page before it loads, so the list a test sees is the one it chose, not whatever listens on the
// machine's port 11434.

/** What `GET /api/models/ollama` answers (web/src/api/models.ts). */
interface OllamaAnswer {
  readonly models: readonly { model: string; label: string; priced: boolean }[];
  readonly reason?: string;
}

/** Ollama cannot be asked: the page keeps the text field and a note (RF-405). */
export const ollamaUnreachable: OllamaAnswer = {
  models: [],
  reason: 'Ollama could not be reached.',
};

/** Answers the Ollama list of the page with `answer`; call it before the page loads. */
export async function answerOllama(page: Page, answer: OllamaAnswer): Promise<void> {
  await page.route('**/api/models/ollama', (route) =>
    route.fulfill({ json: { provider: 'ollama', ...answer } }),
  );
}

/** Saves an empty setting: every role back on "Template default", the context size on Auto. */
async function clearDefaultModels(context: BrowserContext): Promise<void> {
  const cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const session = await context.request.get('/api/session', { headers: { cookie } });
  const { csrfToken } = z.object({ csrfToken: z.string() }).parse(await session.json());
  const saved = await context.request.put('/api/admin/default-roles', {
    data: { roles: {} },
    headers: { origin: e2eOrigin(), cookie, 'x-csrf-token': csrfToken },
  });
  if (!saved.ok()) {
    throw new Error(`Clearing the default models answered ${String(saved.status())}`);
  }
}

/**
 * Takes the turn of the server-wide settings and clears the default models. Returns the function
 * that clears them again and gives the turn up; call it when the test ends. The wait for the turn can
 * be long, so call it from a fixture with its own timeout, not from a hook (the test's 30 s).
 */
export async function takeDefaultModels(context: BrowserContext): Promise<() => Promise<void>> {
  const turn = await acquireCapsLock(capsLockFolder());
  try {
    await clearDefaultModels(context);
  } catch (error) {
    await turn.release();
    throw error;
  }
  return async () => {
    try {
      await clearDefaultModels(context);
    } finally {
      await turn.release();
    }
  };
}
