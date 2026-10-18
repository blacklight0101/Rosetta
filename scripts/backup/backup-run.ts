// RF-1306: one backup run.

export interface BackupOptions {
  readonly now: Date;
  readonly backupDir: string;
  readonly dataDir: string;
  readonly dumpDatabase: (destination: string) => Promise<void>;
  readonly log: (line: string) => void;
}

export interface BackupResult {
  readonly dump: string;
  readonly dataCopy: string | null;
  readonly pruned: readonly string[];
}

export function runBackup(options: BackupOptions): Promise<BackupResult> {
  return Promise.resolve({ dump: options.backupDir.slice(0, 0), dataCopy: null, pruned: [] });
}
