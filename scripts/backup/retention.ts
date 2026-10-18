// RF-1306: which backups to keep. Daily database dumps are kept 7 days; the data folder is copied
// weekly and the newest copies are kept.
import { dayStamp, parseBackupName, type BackupKind } from './names.js';

export const retentionPolicy = { dumpDays: 7, dataCopies: 4, dataIntervalDays: 7 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

interface Backup {
  readonly name: string;
  readonly day: string;
}

/** Whole days from `day` (yyyy-mm-dd) to `today`; negative for a day in the future. */
function ageInDays(day: string, today: Date): number {
  return (Date.parse(`${dayStamp(today)}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS;
}

/** The backups of one kind, newest first. */
function backupsOf(names: readonly string[], kind: BackupKind): Backup[] {
  const found: Backup[] = [];
  for (const name of names) {
    const parsed = parseBackupName(name);
    if (parsed?.kind === kind) found.push({ name, day: parsed.day });
  }
  return found.sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? 1 : -1));
}

/** The names to delete, sorted. Only names this tool created are ever returned. */
export function namesToPrune(names: readonly string[], today: Date): string[] {
  const oldDumps = backupsOf(names, 'db').filter(
    (dump) => ageInDays(dump.day, today) >= retentionPolicy.dumpDays,
  );
  const oldCopies = backupsOf(names, 'data').slice(retentionPolicy.dataCopies);
  return [...oldDumps, ...oldCopies].map((entry) => entry.name).sort();
}

/** True when there is no data copy yet or the newest one is a week old. */
export function dataCopyDue(names: readonly string[], today: Date): boolean {
  const newest = backupsOf(names, 'data')[0];
  return newest === undefined || ageInDays(newest.day, today) >= retentionPolicy.dataIntervalDays;
}

export function newestName(names: readonly string[], kind: BackupKind): string | null {
  return backupsOf(names, kind)[0]?.name ?? null;
}
