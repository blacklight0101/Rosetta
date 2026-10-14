import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';

// RNF-003, P1-49 F-15: the secret scan of a folder of published files. It is the masker of RF-141
// itself, so the patterns that keep a secret out of a log and out of a model call are the ones that
// keep it out of `site/`; gitleaks scans the history with its own rules on top.

/** "<path>: <kind>" for every file under `folder` (any extension) in which the masker finds a secret. */
export async function secretFindings(folder: string): Promise<string[]> {
  const masker = new SecretMasker();
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const path = join(entry.parentPath, entry.name);
    const { counts } = masker.mask(await readFile(path, 'utf8'));
    for (const [kind, count] of Object.entries(counts)) {
      if (count > 0) found.push(`${relative(folder, path).split(sep).join('/')}: ${kind}`);
    }
  }
  return found.sort();
}
