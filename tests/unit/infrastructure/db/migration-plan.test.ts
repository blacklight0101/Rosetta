import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { toMigrationFile } from '../../../../src/infrastructure/db/migration-files.js';
import {
  pendingMigrations,
  requireCurrentSchema,
} from '../../../../src/infrastructure/db/migration-plan.js';

const first = toMigrationFile('0001_first.sql', 'SELECT 1;\n');
const second = toMigrationFile('0002_second.sql', 'SELECT 2;\n');
const third = toMigrationFile('0003_third.sql', 'SELECT 3;\n');

const recorded = (file: typeof first): { version: number; checksum: string } => ({
  version: file.version,
  checksum: file.checksum,
});

function failureOf(action: () => unknown): RosettaError {
  try {
    action();
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('expected a RosettaError');
}

describe('pendingMigrations', () => {
  it('RF-1302 on an empty database every migration is pending, in version order', () => {
    expect(pendingMigrations([], [third, first, second]).map((file) => file.version)).toEqual([
      1, 2, 3,
    ]);
  });

  it('RF-1302 a migration already recorded with the same checksum is not pending', () => {
    expect(pendingMigrations([recorded(first)], [first, second])).toEqual([second]);
  });

  it('RF-1302 nothing is pending when every migration is recorded', () => {
    expect(pendingMigrations([recorded(first), recorded(second)], [first, second])).toEqual([]);
  });

  it('RF-1302 an applied migration whose file has changed stops with RST-2401', () => {
    const edited = toMigrationFile('0001_first.sql', 'SELECT 42;\n');

    const error = failureOf(() => pendingMigrations([recorded(first)], [edited, second]));

    expect(error.code).toBe(ERROR_CODES.migrationChanged);
    expect(error.message).toContain('0001_first.sql');
  });

  it('RF-1302 a database with a migration the image does not know stops with RST-2402', () => {
    const error = failureOf(() =>
      pendingMigrations([recorded(first), { version: 7, checksum: 'abc' }], [first, second]),
    );

    expect(error.code).toBe(ERROR_CODES.migrationUnknown);
    expect(error.message).toContain('7');
  });

  it('RF-1302 two files with the same version stop with RST-2400', () => {
    const twin = toMigrationFile('0001_twin.sql', 'SELECT 9;\n');

    expect(failureOf(() => pendingMigrations([], [first, twin])).code).toBe(
      ERROR_CODES.migrationFileInvalid,
    );
  });
});

// RF-1302, DEC-140 (P1-158): the server no longer migrates; it checks that the migrate step has
// brought the schema up to date and refuses to serve an older, changed or unknown one.
describe('requireCurrentSchema', () => {
  it('RF-1302 a schema with every migration recorded is current', () => {
    expect(() => {
      requireCurrentSchema([recorded(first), recorded(second)], [first, second]);
    }).not.toThrow();
  });

  it('RF-1302 a pending migration stops the server with RST-2405, naming the migrate step', () => {
    const error = failureOf(() => {
      requireCurrentSchema([recorded(first)], [first, second, third]);
    });

    expect(error.code).toBe(ERROR_CODES.migrationPending);
    expect(error.message).toContain('2 migration(s)');
    expect(error.message).toContain('0002_second.sql');
    expect(error.nextStep).toContain('migrate');
  });

  it('RF-1302 a database without a readable schema_version has every migration pending', () => {
    const error = failureOf(() => {
      requireCurrentSchema(undefined, [first, second]);
    });

    expect(error.code).toBe(ERROR_CODES.migrationPending);
    expect(error.message).toContain('2 migration(s)');
  });

  it('RF-1302 a changed or unknown migration still stops with RST-2401 or RST-2402', () => {
    const edited = toMigrationFile('0001_first.sql', 'SELECT 42;\n');
    const unknown = { version: 9, checksum: 'abc' };

    const changed = failureOf(() => {
      requireCurrentSchema([recorded(first)], [edited]);
    });
    const extra = failureOf(() => {
      requireCurrentSchema([recorded(first), unknown], [first]);
    });

    expect(changed.code).toBe(ERROR_CODES.migrationChanged);
    expect(extra.code).toBe(ERROR_CODES.migrationUnknown);
  });
});
