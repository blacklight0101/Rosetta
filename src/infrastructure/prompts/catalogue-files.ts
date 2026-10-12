import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  catalogueGroups,
  catalogueProblems,
  isArchitectureStyle,
  type Catalogue,
  type CatalogueEntry,
} from '../../domain/planning/catalogue.js';
import { parseCatalogueEntry, parseCatalogueReadme } from './catalogue-entry-file.js';

// RF-606, DEC-84, RNF-004: the catalogue folder `prompts/catalogue/`. Every file is named
// `<id>.v<n>.md`; `readme.v<n>.md` declares the catalogue version and credits the master (DEC-85),
// every other file is one entry. The SHA-256 runs over each file's name and bytes in name order, so
// a plan run can record exactly which catalogue it used. A missing folder or README, a file
// without a version, two versions of one entry, an empty group or a missing style is refused with
// RST-1000.

const catalogueFolder = 'catalogue';
const fileNamePattern = /^([a-z0-9-]+)\.v\d+\.md$/u;
const readmeStem = 'readme';

interface CatalogueFile {
  readonly name: string;
  readonly stem: string;
  readonly bytes: Buffer;
}

function invalid(problem: string, cause?: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.configurationInvalid, `The principle catalogue ${problem}.`, {
    cause,
  });
}

async function readCatalogueFiles(folder: string): Promise<CatalogueFile[]> {
  let names: string[];
  try {
    names = (await readdir(folder)).filter((name) => !name.startsWith('.')).sort();
  } catch (error) {
    throw invalid('could not be read', error);
  }
  return Promise.all(
    names.map(async (name) => {
      const stem = fileNamePattern.exec(name)?.[1];
      if (stem === undefined) throw invalid(`holds ${name}, whose name carries no version`);
      return { name, stem, bytes: await readFile(join(folder, name)) };
    }),
  );
}

function sha256Of(files: readonly CatalogueFile[]): string {
  const hash = createHash('sha256');
  for (const { name, bytes } of files) hash.update(`${name}\n`).update(bytes);
  return hash.digest('hex');
}

function byGroupThenId(left: CatalogueEntry, right: CatalogueEntry): number {
  const groups = catalogueGroups.indexOf(left.group) - catalogueGroups.indexOf(right.group);
  if (groups !== 0) return groups;
  return left.id < right.id ? -1 : 1;
}

/** Reads, checks and hashes the principle catalogue under `promptsFolder` (RF-606). */
// RF-606, RNF-004
export async function loadCatalogue(promptsFolder: string): Promise<Catalogue> {
  const files = await readCatalogueFiles(join(promptsFolder, catalogueFolder));
  const readmes = files.filter((file) => file.stem === readmeStem);
  const [readme] = readmes;
  if (readme === undefined || readmes.length > 1) throw invalid('must hold exactly one README');
  const entries = files
    .filter((file) => file.stem !== readmeStem)
    .map((file) => parseCatalogueEntry(file.name, file.bytes.toString('utf8')));
  const problems = catalogueProblems(entries);
  if (problems.length > 0) throw invalid(`is incomplete: ${problems.join(' ')}`);
  const sorted = entries.sort(byGroupThenId);
  return {
    version: parseCatalogueReadme(readme.bytes.toString('utf8')),
    sha256: sha256Of(files),
    entries: sorted,
    styles: sorted.filter(isArchitectureStyle),
  };
}
