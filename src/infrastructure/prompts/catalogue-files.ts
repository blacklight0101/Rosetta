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
import type { AgentModelMaps } from '../../domain/planning/build-method.js';
import type { ClaimVerbs } from '../../domain/planning/claim-verbs.js';
import type { GrepRules } from '../../domain/planning/grep-rules.js';
import type { StackData } from '../../domain/planning/stack-data.js';
import { parseCatalogueEntry, parseCatalogueReadme } from './catalogue-entry-file.js';
import { parseStackProposals, parseStackRules, parseStackTechnologies } from './stack-data-file.js';
import { parseClaimVerbs } from './claim-verbs-file.js';
import { parseGrepRules } from './grep-rules-file.js';
import { parseAgentModels } from './agent-models-file.js';

// RF-606, DEC-84, RNF-004: the catalogue folder `prompts/catalogue/`. Every file is named
// `<id>.v<n>.md`; `readme.v<n>.md` declares the catalogue version and credits the master (DEC-85),
// every other file is one entry. The SHA-256 runs over each file's name and bytes in name order, so
// a plan run can record exactly which catalogue it used. A missing folder or README, a file
// without a version, two versions of one entry, an empty group or a missing style is refused with
// RST-1000. The three stack files (`stack-technologies`, `stack-rules`, `stack-proposals`, YAML) are part of the folder:
// they are hashed with it and read by `stackOf` (RF-609).
// P5-43: `claim-verbs` is part of the folder too. P6-28: so is `grep-rules` (RF-640, DEC-190).

const catalogueFolder = 'catalogue';
const fileNamePattern = /^([a-z0-9-]+)\.v(\d+)\.(?:md|yaml)$/u;
const readmeStem = 'readme';
const technologiesStem = 'stack-technologies';
const rulesStem = 'stack-rules';
const proposalsStem = 'stack-proposals';
const verbsStem = 'claim-verbs';
const grepsStem = 'grep-rules';
const agentModelsStem = 'agent-models';

interface CatalogueFile {
  readonly name: string;
  readonly stem: string;
  readonly version: number;
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
      const match = fileNamePattern.exec(name);
      const stem = match?.[1];
      if (stem === undefined) throw invalid(`holds ${name}, whose name carries no version`);
      const version = Number(match?.[2]);
      return { name, stem, version, bytes: await readFile(join(folder, name)) };
    }),
  );
}

const dataStems = [
  technologiesStem,
  rulesStem,
  proposalsStem,
  verbsStem,
  grepsStem,
  agentModelsStem,
];

function oneFile(files: readonly CatalogueFile[], stem: string): CatalogueFile {
  const found = files.filter((file) => file.stem === stem);
  const [file] = found;
  if (file === undefined || found.length > 1) throw invalid(`must hold exactly one ${stem} file`);
  return file;
}

/** RF-609, P5-39: the technologies, the rules of the stack check and the proposals, from their files. */
function stackOf(files: readonly CatalogueFile[]): StackData {
  const technologies = oneFile(files, technologiesStem);
  const rules = oneFile(files, rulesStem);
  const proposals = oneFile(files, proposalsStem);
  const known = parseStackTechnologies(technologies.name, technologies.bytes.toString('utf8'));
  return {
    rulesVersion: rules.version,
    technologies: known,
    rules: parseStackRules(rules.name, rules.bytes.toString('utf8')),
    proposals: parseStackProposals(proposals.name, proposals.bytes.toString('utf8'), known),
  };
}

/** P5-43: the verbs that contradict each other, from their file. */
function claimVerbsOf(files: readonly CatalogueFile[]): ClaimVerbs {
  const file = oneFile(files, verbsStem);
  return parseClaimVerbs(file.name, file.version, file.bytes.toString('utf8'));
}

/** P6-28: the hard-rule greps and the language aliases, from their file; they may cite only known entries. */
function grepRulesOf(
  files: readonly CatalogueFile[],
  entries: readonly CatalogueEntry[],
): GrepRules {
  const file = oneFile(files, grepsStem);
  const known = new Set(entries.map((each) => each.id));
  return parseGrepRules(file.name, file.version, file.bytes.toString('utf8'), known);
}

/** P7-23, RF-639: the default model names of Claude Code and Codex, from their file. */
function agentModelsOf(files: readonly CatalogueFile[]): AgentModelMaps {
  const file = oneFile(files, agentModelsStem);
  return parseAgentModels(file.name, file.bytes.toString('utf8'));
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
    .filter((file) => !dataStems.includes(file.stem) && file.stem !== readmeStem)
    .map((file) => parseCatalogueEntry(file.name, file.bytes.toString('utf8')));
  const problems = catalogueProblems(entries);
  if (problems.length > 0) throw invalid(`is incomplete: ${problems.join(' ')}`);
  const sorted = entries.sort(byGroupThenId);
  return {
    version: parseCatalogueReadme(readme.bytes.toString('utf8')),
    sha256: sha256Of(files),
    entries: sorted,
    styles: sorted.filter(isArchitectureStyle),
    stack: stackOf(files),
    claimVerbs: claimVerbsOf(files),
    grepRules: grepRulesOf(files, entries),
    agentModels: agentModelsOf(files),
  };
}
