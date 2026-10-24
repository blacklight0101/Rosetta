import { parse } from 'yaml';
import { z } from 'zod';
import { holdsDataMarker } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { ClaimVerbs } from '../../domain/planning/claim-verbs.js';

// P5-43, RF-602, RNF-004: `claim-verbs.v<n>.yaml` of the catalogue. Anything that does not fit the
// shapes below is refused with RST-1000 rather than half read, so the claim meaning check never
// runs on a broken table.

const word = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[\p{L}\p{N}]{3,30}$/u);

const shortWord = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[\p{L}\p{N}]{1,30}$/u);

const sideSchema = z.strictObject({
  label: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((text) => !text.includes('\n'), 'must be one line'),
  terms: z.array(word).min(1).max(30),
});

const familySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  sides: z.array(sideSchema).min(2).max(4),
});

const fileSchema = z.strictObject({
  families: z.array(familySchema).min(1).max(50),
  documentation: z.strictObject({
    extensions: z.array(shortWord).max(20),
    names: z.array(shortWord).max(20),
  }),
  stopWords: z.array(word).max(300),
});

function invalid(name: string, problem: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.configurationInvalid,
    `The catalogue file ${name} ${problem}.`,
    { cause },
  );
}

/** The verb families of `claim-verbs.v<n>.yaml`; a repeated family id is refused. */
// RF-602
export function parseClaimVerbs(name: string, version: number, text: string): ClaimVerbs {
  if (holdsDataMarker(text)) throw invalid(name, 'holds a data block marker');
  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    throw invalid(name, 'is not valid YAML', error);
  }
  const parsed = fileSchema.safeParse(document);
  if (!parsed.success) throw invalid(name, 'breaks its shape', parsed.error);
  const { families, documentation, stopWords } = parsed.data;
  if (new Set(families.map((family) => family.id)).size !== families.length) {
    throw invalid(name, 'repeats a family id');
  }
  return {
    version,
    families,
    documentExtensions: documentation.extensions,
    documentNames: documentation.names,
    stopWords,
  };
}
