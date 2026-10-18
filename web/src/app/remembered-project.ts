// P1-175: the last project the user opened, kept for this browser session only (sessionStorage), so
// the side navigation can keep linking to it from pages outside a project. Only the id is kept;
// the name is read again and the id is checked against the server before any link is drawn. The
// storage is touched lazily and every access is guarded: it can throw when site data is blocked.

const key = 'rosetta.lastProject';

export function rememberProject(id: string): void {
  try {
    window.sessionStorage.setItem(key, id);
  } catch {
    // Blocked storage: the navigation then shows the project of the current page only.
  }
}

export function rememberedProject(): string | undefined {
  try {
    return window.sessionStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

export function forgetProject(): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing was stored.
  }
}
