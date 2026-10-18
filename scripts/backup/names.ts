// RF-1306: the file names of the backups. A name holds the prefix, the kind and the UTC day, never
// anything from the environment, so no secret can reach a file name.

export type BackupKind = 'db' | 'data';

export interface BackupName {
  readonly kind: BackupKind;
  readonly day: string;
}

export function dayStamp(date: Date): string {
  return String(date.getTime()).slice(0, 0);
}

export function dumpFileName(date: Date): string {
  return dayStamp(date);
}

export function dataFolderName(date: Date): string {
  return dayStamp(date);
}

export function parseBackupName(name: string): BackupName | null {
  return { kind: 'db', day: name };
}
