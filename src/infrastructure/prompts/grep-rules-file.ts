import { parse } from 'yaml';
import { z } from 'zod';
import { holdsDataMarker } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { GrepRules } from '../../domain/planning/grep-rules.js';
import { riskClasses } from '../../domain/planning/task-card-quality.js';

// P6-28, RF-640, RNF-004, DEC-190: `grep-rules.v<n>.yaml` of the catalogue. Anything that does not
// fit the shapes below is refused with RST-1000 rather than half read, so the hard-rule table never
// runs on a broken file. A pattern is written in a code span of a table, so it holds no backtick,
// pipe, line break, control or format character; it is kept as written (a trailing space counts).

const anyLanguage = 'any';
const id = z.string().regex(/^[a-z][a-z0-9-]{0,29}$/u);
const alias = z.string().trim().toLowerCase().min(1).max(30);
const pattern = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[^`|\p{Cc}\p{Cf}]+$/u);
const principleId = z.string().regex(/^[a-z0-9-]+$/u);

const languageSchema = z.strictObject({ id, aliases: z.array(alias).min(1).max(30) });

const ruleSchema = z.strictObject({
  rule: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((text) => !text.includes('\n'), 'must be one line'),
  stated: z.array(principleId).max(10),
  suggested: z.array(principleId).max(10),
  risks: z.array(z.enum(riskClasses)).max(4),
  patterns: z.record(z.string(), z.array(pattern).min(1).max(10)),
});

const fileSchema = z.strictObject({
  languages: z.array(languageSchema).min(1).max(20),
  rules: z.array(ruleSchema).min(1).max(100),
});

function invalid(name: string, problem: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.configurationInvalid,
    `The catalogue file ${name} ${problem}.`,
    { cause },
  );
}

function checked(name: string, rules: GrepRules, known: ReadonlySet<string>): GrepRules {
  const ids = rules.languages.map((each) => each.id);
  if (new Set(ids).size !== ids.length || ids.includes(anyLanguage)) {
    throw invalid(name, 'repeats a language id or uses the id any');
  }
  for (const each of rules.rules) {
    const unknownLanguage = Object.keys(each.patterns).find(
      (key) => key !== anyLanguage && !ids.includes(key),
    );
    if (unknownLanguage !== undefined) {
      throw invalid(name, `has patterns for the undeclared language ${unknownLanguage}`);
    }
    const unknownPrinciple = [...each.stated, ...each.suggested].find((entry) => !known.has(entry));
    if (unknownPrinciple !== undefined) {
      throw invalid(name, `names ${unknownPrinciple}, which is not a catalogue entry`);
    }
  }
  return rules;
}

/** The languages and rules of `grep-rules.v<n>.yaml`; `known` holds the ids of the catalogue entries. */
// RF-640
export function parseGrepRules(
  name: string,
  version: number,
  text: string,
  known: ReadonlySet<string>,
): GrepRules {
  if (holdsDataMarker(text)) throw invalid(name, 'holds a data block marker');
  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    throw invalid(name, 'is not valid YAML', error);
  }
  const parsed = fileSchema.safeParse(document);
  if (!parsed.success) throw invalid(name, 'breaks its shape', parsed.error);
  return checked(name, { version, ...parsed.data }, known);
}
