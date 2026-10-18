import { describe, expect, it } from 'vitest';
import { dumpFileName } from '../../../scripts/backup/names.js';
import { dataCopyDue, namesToPrune, newestName } from '../../../scripts/backup/retention.js';

const today = new Date('2026-10-18T03:00:00Z');
const dump = (stamp: string): string => dumpFileName(new Date(`${stamp}T00:00:00Z`));

describe('backup retention', () => {
  it('RF-1306 keeps daily dumps for 7 days and prunes the older ones', () => {
    const names = [
      dump('2026-10-18'),
      dump('2026-10-17'),
      dump('2026-10-12'),
      dump('2026-10-11'),
      dump('2026-10-01'),
    ];
    expect(namesToPrune(names, today)).toEqual([dump('2026-10-01'), dump('2026-10-11')]);
  });

  it('RF-1306 never prunes a name it did not create or a dump dated in the future', () => {
    const names = ['notes.txt', 'rosetta-db-2026-10-19.dump', 'rosetta-db-2026-09-01.dump.partial'];
    expect(namesToPrune(names, today)).toEqual([]);
  });

  it('RF-1306 keeps the newest four weekly data copies', () => {
    const names = [
      'rosetta-data-2026-10-18',
      'rosetta-data-2026-10-11',
      'rosetta-data-2026-10-04',
      'rosetta-data-2026-09-27',
      'rosetta-data-2026-09-20',
      'rosetta-data-2026-09-13',
    ];
    expect(namesToPrune(names, today)).toEqual([
      'rosetta-data-2026-09-13',
      'rosetta-data-2026-09-20',
    ]);
  });

  it('RF-1306 copies the data folder when the newest copy is 7 days old or there is none', () => {
    expect(dataCopyDue([], today)).toBe(true);
    expect(dataCopyDue(['rosetta-data-2026-10-18'], today)).toBe(false);
    expect(dataCopyDue(['rosetta-data-2026-10-12'], today)).toBe(false);
    expect(dataCopyDue(['rosetta-data-2026-10-11'], today)).toBe(true);
    expect(dataCopyDue([dump('2026-10-18')], today)).toBe(true);
  });

  it('RF-1306 finds the newest backup of a kind for a restore', () => {
    const names = [dump('2026-10-16'), dump('2026-10-18'), 'rosetta-data-2026-10-11', 'x'];
    expect(newestName(names, 'db')).toBe(dump('2026-10-18'));
    expect(newestName(names, 'data')).toBe('rosetta-data-2026-10-11');
    expect(newestName(['x'], 'db')).toBeNull();
  });
});
