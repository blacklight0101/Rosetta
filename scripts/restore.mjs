// RF-1306: `npm run restore -- [--dump <file>] [--data-target <dir> [--data-copy <name>]] [--force]`.
// Restores the newest dump (or the named one) of ROSETTA_BACKUP_DIR into an empty database and,
// with --data-target, the newest data copy into an empty folder. It refuses a database that has
// tables or a folder that is not empty unless --force is given. Same settings as `npm run backup`.
const { restoreMain } = await import('./backup/cli.ts');

try {
  await restoreMain(process.argv.slice(2), process.env, (line) => {
    console.log(line);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The restore failed.');
  process.exitCode = 1;
}
