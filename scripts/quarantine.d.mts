// Types for scripts/quarantine.mjs, so that the quarantine list can be used from TypeScript.
export interface QuarantineEntry {
  readonly file: string;
  readonly title: readonly string[];
  readonly owner: string;
  readonly issue: number;
  readonly until: string;
  readonly flakeRun: string;
}

export const QUARANTINE_FILE: string;
export function isVitestFile(file: string): boolean;
export function isPlaywrightFile(file: string): boolean;
export function quarantineProblems(raw: unknown, today: string): string[];
export function readQuarantine(path?: string): Promise<QuarantineEntry[]>;
export function isQuarantined(
  entries: readonly QuarantineEntry[],
  file: string,
  titles: readonly string[],
): boolean;
export function playwrightTestList(entries: readonly QuarantineEntry[]): string;
