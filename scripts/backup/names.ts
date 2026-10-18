// RF-1306: the file names of the backups. A name holds the prefix, the kind and the UTC day, never
// anything from the environment, so no secret can reach a file name.

export type BackupKind = 'db' | 'data';

export interface BackupName {
  readonly kind: BackupKind;
  readonly day: string;
}

const DUMP = /^rosetta-db-(\d{4}-\d{2}-\d{2})\.dump$/u;
const DATA = /^rosetta-data-(\d{4}-\d{2}-\d{2})$/u;

export function dayStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dumpFileName(date: Date): string {
  return `rosetta-db-${dayStamp(date)}.dump`;
}

export function dataFolderName(date: Date): string {
  return `rosetta-data-${dayStamp(date)}`;
}

function isRealDay(stamp: string): boolean {
  const date = new Date(`${stamp}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && dayStamp(date) === stamp;
}

/** The kind and the day of a backup this tool created; null for any other name. */
export function parseBackupName(name: string): BackupName | null {
  const candidates: readonly (readonly [BackupKind, RegExp])[] = [
    ['db', DUMP],
    ['data', DATA],
  ];
  for (const [kind, pattern] of candidates) {
    const day = pattern.exec(name)?.[1];
    if (day !== undefined && isRealDay(day)) return { kind, day };
  }
  return null;
}
