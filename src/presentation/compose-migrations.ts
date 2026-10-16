import type { AppliedMigration } from '../application/ports/migrator.js';
import type { MigrationEnvironment } from '../infrastructure/config/environment.js';

export interface MigrateOptions {
  readonly environment: MigrationEnvironment;
  readonly output: { write(text: string): unknown };
}

/** Not implemented yet (P1-158 red step). */
export function migrateDatabase(options: MigrateOptions): Promise<readonly AppliedMigration[]> {
  return Promise.reject(new Error(`not implemented: ${options.environment.logLevel}`));
}
