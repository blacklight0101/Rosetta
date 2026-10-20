// RF-405, DEC-156: the models installed on the configured Ollama server. The adapter reads the
// server's own configured URL; the caller never names one.

export type InstalledModelsResult =
  | { readonly ok: true; readonly models: readonly string[] }
  /** The server cannot be asked or did not answer; `reason` is a plain sentence for the page. */
  | { readonly ok: false; readonly reason: string };

export interface InstalledModels {
  list(): Promise<InstalledModelsResult>;
}
