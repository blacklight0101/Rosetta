import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-1303: the Rosetta version reported by GET /healthz is the `version` of the package.json that
// ships with the server. The file is at the same depth from `src/` and from the built `dist/`.
const shippedManifest = new URL('../../../package.json', import.meta.url);

const manifestSchema = z.object({ version: z.string().min(1) });

/** Reads the version once at start-up; throws RST-2500 when the file has none. */
// RF-1303
export async function readAppVersion(file: string | URL = shippedManifest): Promise<string> {
  try {
    const manifest: unknown = JSON.parse(await readFile(file, 'utf8'));
    return manifestSchema.parse(manifest).version;
  } catch (error) {
    throw new RosettaError(ERROR_CODES.versionUnreadable, undefined, { cause: error });
  }
}
