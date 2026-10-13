import { escapeHtml } from './html-text.js';

// RF-800, P1-50: the check of the published index that the Pages smoke step runs. It is kept apart
// from the site builder (published-site.ts), so the smoke step needs no package of the repository:
// this module imports nothing but html-text.ts.

export type IndexCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

// RF-800: the index names the run, which the smoke step looks for after the deployment.
export function checkPublishedIndex(html: string, runKey: string): IndexCheck {
  if (html.trim() === '') return { ok: false, reason: 'The index page is empty.' };
  if (!html.includes(`<span class="mono">${escapeHtml(runKey)}</span>`)) {
    return { ok: false, reason: `The index page does not show run ${runKey}.` };
  }
  return { ok: true };
}
