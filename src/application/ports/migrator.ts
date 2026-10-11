// RF-1302: the database schema is brought up to date before the server accepts requests.

/** One migration applied by a run of the migrator. */
export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
}

export interface Migrator {
  /**
   * Applies the pending migrations in version order, each in its own transaction, and returns
   * them; an empty list means the schema was already current. Refuses (throws a RosettaError)
   * when an applied migration has changed, when the database has a migration this version does
   * not know, or when a migration fails, leaving the previous schema in place.
   */
  migrate(): Promise<readonly AppliedMigration[]>;
}
