import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The commit every fixture archive stands for (a made-up value, see the fixtures README). */
export const FIXTURE_SHA = '3f786850e387550fdab836ed7e6dc881de23001b';

export type SnapshotFixture = 'normal' | 'traversal' | 'links' | 'oversized' | 'many-entries';

/** The files of `normal.tar.gz`, relative to the repository root, with their content. */
export const NORMAL_FILES: Readonly<Record<string, string>> = {
  '.rosettaignore': '*.pfx\n',
  'README.md': '# Demo\n\nA small fixture repository for the snapshot tests.\n',
  'src/App.cs': 'namespace Demo { public class App { } }\n',
  'src/lib/Util.cs': 'namespace Demo.Lib { public static class Util { } }\n',
};

export function fixtureArchive(name: SnapshotFixture): Promise<Buffer> {
  return readFile(join(process.cwd(), 'tests', 'fixtures', 'snapshots', `${name}.tar.gz`));
}
