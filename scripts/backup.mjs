// RF-1306: `npm run backup`, one backup run: a pg_dump of the database into ROSETTA_BACKUP_DIR, a
// weekly copy of ROSETTA_DATA_DIR, and the 7-day pruning. Run it daily from the host's scheduler
// (docs/runbooks/backup.md). Settings: ROSETTA_BACKUP_DATABASE_URL (an administrative role),
// ROSETTA_BACKUP_DIR, ROSETTA_DATA_DIR and, to run pg_dump inside a container,
// ROSETTA_BACKUP_DB_CONTAINER.
const { backupMain } = await import('./backup/cli.ts');

try {
  await backupMain(process.env, (line) => {
    console.log(line);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The backup failed.');
  process.exitCode = 1;
}
