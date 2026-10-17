import { z } from 'zod';
import {
  createCitation,
  parseCitation,
  type Citation,
  type CitationProblem,
} from '../../domain/cards/citation.js';
import { cardLimits } from './card-limits.js';

// RF-202, ADR-005: the field readers every card schema shares (card, FLOW and SCRN).

const citationMessages: Readonly<Record<CitationProblem, string>> = {
  'invalid-format': 'A citation must look like path/to/file.ext:startLine-endLine.',
  'invalid-path': 'A citation path must be relative to the repository root, with forward slashes.',
  'invalid-lines': 'A citation needs whole line numbers with 1 <= startLine <= endLine.',
};

const lineNumber = z.union([
  z.number().int().max(cardLimits.maxLineNumber),
  z
    .string()
    .trim()
    .regex(/^\d{1,9}$/)
    .transform(Number),
]);
const path = z.string().min(1).max(cardLimits.maxPathChars);

const citationShape = z.union([
  z.string().max(cardLimits.maxPathChars + 24),
  z.object({ path, startLine: lineNumber, endLine: lineNumber }),
]);

export const citation = citationShape.transform((value, context): Citation => {
  const made =
    typeof value === 'string'
      ? parseCitation(value.trim())
      : createCitation(value.path, value.startLine, value.endLine);
  if (made.ok) return made.value;
  context.addIssue({ code: 'custom', message: citationMessages[made.error] });
  return z.NEVER;
});

export function ignoringCase<T extends string>(
  values: readonly [T, ...T[]],
): z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodEnum<{ [K in T]: K }>> {
  return z
    .string()
    .transform((text) => values.find((v) => v.toLowerCase() === text.trim().toLowerCase()) ?? text)
    .pipe(z.enum(values));
}

export const text = (max: number): z.ZodString => z.string().trim().min(1).max(max);
