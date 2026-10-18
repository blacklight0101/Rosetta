import { describe, expect, it } from 'vitest';
import {
  dataFolderName,
  dayStamp,
  dumpFileName,
  parseBackupName,
} from '../../../scripts/backup/names.js';

const day = new Date('2026-10-18T23:59:59Z');

describe('backup names', () => {
  it('RF-1306 names a daily dump and a weekly data copy by their UTC day', () => {
    expect(dayStamp(day)).toBe('2026-10-18');
    expect(dumpFileName(day)).toBe('rosetta-db-2026-10-18.dump');
    expect(dataFolderName(day)).toBe('rosetta-data-2026-10-18');
  });

  it('RF-1306 reads a name back and ignores every other name', () => {
    expect(parseBackupName('rosetta-db-2026-10-18.dump')).toEqual({
      kind: 'db',
      day: '2026-10-18',
    });
    expect(parseBackupName('rosetta-data-2026-10-11')).toEqual({ kind: 'data', day: '2026-10-11' });
    for (const other of [
      'notes.txt',
      'rosetta-db-2026-13-40.dump',
      'rosetta-db-2026-10-18.dump.partial',
      'rosetta-data-2026-10-11.partial',
      'old-rosetta-db-2026-10-18.dump',
      '',
    ]) {
      expect(parseBackupName(other)).toBeNull();
    }
  });

  it('RF-1306 puts nothing but the day in a file name, so no secret can reach it', () => {
    const shape = /^rosetta-(db-\d{4}-\d{2}-\d{2}\.dump|data-\d{4}-\d{2}-\d{2})$/u;
    expect(dumpFileName(day)).toMatch(shape);
    expect(dataFolderName(day)).toMatch(shape);
  });
});
