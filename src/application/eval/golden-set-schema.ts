import { z } from 'zod';
import { CARD_TYPES } from '../../domain/cards/card-vocabulary.js';
import { parseCitation, type Citation } from '../../domain/cards/citation.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { STEM_MARK } from '../../domain/eval/claim-match.js';
import {
  FINDING_KINDS,
  type GoldenCase,
  type GoldenFinding,
  type GoldenSet,
} from '../../domain/eval/golden-set.js';
import { isRepositoryPath } from '../../domain/sources/permalink.js';

// RNF-006, RNF-015, DEC-57: the golden set file is hand-written data, `unknown` until this schema
// has read it. Every object is strict (an unknown key is refused), every list and text has a
// limit, every path is a repository path (no `..`, no absolute or Windows path), every evidence
// citation parses and names a path of its own case, every id is unique in the set, and the set
// holds at least one "not in the code" case. A word may end in `*` (a stem) and holds no other
// `*`; no pattern word of an absence holds one of its `unless` words (the pattern could never
// match). Anything else is refused with every problem named.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u, 'must be lower-case words joined by -');
const word = z.string().trim().min(1).max(80);
const statement = z.string().trim().min(1).max(2000);
const repositoryPath = z.string().max(400).refine(isRepositoryPath, 'is not a repository path');

const findingSchema = z.strictObject({
  id,
  kind: z.enum(FINDING_KINDS),
  statement,
  cardTypes: z.array(z.enum(CARD_TYPES)).max(CARD_TYPES.length),
  evidence: z.array(z.string().max(420)).min(1).max(20),
  keywords: z.array(word).min(1).max(20),
});

const absenceSchema = z.strictObject({
  id,
  statement,
  claimPatterns: z.array(z.array(word).min(1).max(5)).min(1).max(20),
  unless: z.array(word).max(20),
});

const caseSchema = z.strictObject({
  id,
  title: z.string().trim().min(1).max(200),
  paths: z.array(repositoryPath).min(1).max(200),
  findings: z.array(findingSchema).max(200),
  absences: z.array(absenceSchema).max(50),
});

const githubUrl = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/u;

const setSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.string().trim().min(1).max(40),
  description: z.string().max(2000),
  source: z.strictObject({
    url: z.string().regex(githubUrl, 'must be https://github.com/<owner>/<repo>'),
    commit: z.string().regex(/^[0-9a-f]{40}$/u, 'must be a full commit SHA'),
    subpath: z.union([z.literal(''), repositoryPath]),
  }),
  cases: z.array(caseSchema).min(1).max(100),
});

type RawSet = z.infer<typeof setSchema>;
type RawCase = RawSet['cases'][number];
type RawFinding = RawCase['findings'][number];
type RawAbsence = RawCase['absences'][number];

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length === 0 ? 'the golden set' : issue.path.map(String).join('.');
    return `${where}: ${issue.message}`;
  });
}

function evidenceOf(raw: RawFinding, entry: RawCase, problems: string[]): Citation[] {
  const paths = new Set(entry.paths);
  return raw.evidence.flatMap((text) => {
    const parsed = parseCitation(text);
    if (!parsed.ok) {
      problems.push(`${entry.id}.${raw.id}: the evidence ${text} is not path:start-end`);
      return [];
    }
    if (!paths.has(parsed.value.path)) {
      problems.push(`${entry.id}.${raw.id}: the evidence ${text} is outside the paths of its case`);
      return [];
    }
    return [parsed.value];
  });
}

/** The words that hold a `*` before their last character. */
function misplacedStars(entry: RawCase): string[] {
  const words = [
    ...entry.findings.flatMap((raw) => raw.keywords),
    ...entry.absences.flatMap((raw) => [...raw.claimPatterns.flat(), ...raw.unless]),
  ];
  return words
    .filter((value) => value.slice(0, -1).includes(STEM_MARK))
    .map((value) => `${entry.id}: the word ${value} may end in ${STEM_MARK} but hold no other`);
}

/** RNF-015, DEC-57: a pattern word that holds an `unless` word excuses every claim it matches. */
function deadPatterns(entry: RawCase, raw: RawAbsence): string[] {
  const unless = raw.unless.map((value) => value.toLowerCase());
  return raw.claimPatterns.flat().flatMap((value) => {
    const excused = unless.find((word) => value.toLowerCase().includes(word));
    if (excused === undefined) return [];
    return [
      `${entry.id}.${raw.id}: the pattern word "${value}" holds the unless word "${excused}", so the pattern never matches`,
    ];
  });
}

function caseOf(entry: RawCase, problems: string[]): GoldenCase {
  problems.push(...misplacedStars(entry));
  problems.push(...entry.absences.flatMap((raw) => deadPatterns(entry, raw)));
  const findings: GoldenFinding[] = entry.findings.map((raw) => ({
    ...raw,
    evidence: evidenceOf(raw, entry, problems),
  }));
  return { ...entry, findings };
}

function duplicateIds(cases: readonly RawCase[]): string[] {
  const ids = cases.flatMap((entry) => [
    entry.id,
    ...entry.findings.map((finding) => finding.id),
    ...entry.absences.map((absence) => absence.id),
  ]);
  const twice = ids.filter((value, index) => ids.indexOf(value) !== index);
  return [...new Set(twice)].map((value) => `the id ${value} is used more than once`);
}

function repoOf(url: string): { owner: string; repo: string } {
  const [, owner = '', repo = ''] = githubUrl.exec(url) ?? [];
  return { owner, repo };
}

// RNF-006, RNF-015
export function parseGoldenSet(data: unknown): Result<GoldenSet, readonly string[]> {
  const parsed = setSchema.safeParse(data);
  if (!parsed.success) return err(issuesOf(parsed.error));
  const raw = parsed.data;
  const problems = duplicateIds(raw.cases);
  const cases = raw.cases.map((entry) => caseOf(entry, problems));
  if (cases.every((entry) => entry.absences.length === 0)) {
    problems.push(
      'the golden set has no "not in the code" case (an absence), which DEC-57 asks for',
    );
  }
  for (const entry of cases.filter((c) => c.findings.length + c.absences.length === 0)) {
    problems.push(`${entry.id}: a case needs at least one finding or absence`);
  }
  if (problems.length > 0) return err(problems);
  const source = { ...raw.source, ...repoOf(raw.source.url) };
  return ok({ ...raw, source, cases });
}
