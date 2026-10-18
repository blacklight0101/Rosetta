// RF-1306: one restore run.

export interface RestoreOptions {
  readonly dumpFile: string;
  readonly dataSource?: string | undefined;
  readonly dataTarget?: string | undefined;
  readonly force: boolean;
  readonly countTables: () => Promise<number>;
  readonly restoreDatabase: (dumpFile: string, replace: boolean) => Promise<void>;
  readonly log: (line: string) => void;
}

export interface RestoreResult {
  readonly databaseRestored: boolean;
  readonly dataRestored: boolean;
}

export class RestoreRefused extends Error {}

export function runRestore(options: RestoreOptions): Promise<RestoreResult> {
  return Promise.resolve({ databaseRestored: options.force && false, dataRestored: false });
}
