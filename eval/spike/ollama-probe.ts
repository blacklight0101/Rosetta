// P1-47 stub: the real probe comes with the feat commit.
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type OllamaProbe =
  | { readonly ok: true; readonly baseUrl: string; readonly pulled: readonly string[] }
  | { readonly ok: false; readonly message: string };

export function probeOllama(url: string, fetchTags: Fetch): Promise<OllamaProbe> {
  return Promise.resolve({ ok: false, message: `${url} ${typeof fetchTags}` });
}

export function pullCommands(models: readonly string[], pulled: readonly string[]): string[] {
  return models.slice(pulled.length, 0);
}
