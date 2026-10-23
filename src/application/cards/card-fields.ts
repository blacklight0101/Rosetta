import { z } from 'zod';
import {
  createCitation,
  parseCitation,
  type Citation,
  type CitationProblem,
} from '../../domain/cards/citation.js';
import { cardLimits } from './card-limits.js';
import { decodeTextEscapes } from './card-text-escapes.js';

// RF-202, ADR-005: the field readers every card schema shares (card, FLOW and SCRN).

const citationMessages: Readonly<Record<CitationProblem, string>> = {
  'invalid-format':
    'A citation must look like path/to/file.ext:startLine-endLine, with the line numbers that read_file shows before each line; never the text of a line or a row label.',
  'invalid-path': 'A citation path must be relative to the repository root, with forward slashes.',
  'invalid-lines': 'A citation needs whole line numbers with 1 <= startLine <= endLine.',
};

/** Characters of a citation the model wrote that a problem repeats back to it (Q-47). */
const shownCitationChars = 80;

/** The problem as the model reads it; a citation it wrote as text is named, so it can fix that one. */
function citationMessage(problem: CitationProblem, written: string | undefined): string {
  const message = citationMessages[problem];
  if (written === undefined) return message;
  const cut =
    written.length > shownCitationChars ? `${written.slice(0, shownCitationChars)}...` : written;
  return `${message} You wrote: ${JSON.stringify(cut)}.`;
}

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
  const written = typeof value === 'string' ? value.trim() : undefined;
  context.addIssue({ code: 'custom', message: citationMessage(made.error, written) });
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

// P5-09: the literal escapes a model left in card and claim text are decoded before the checks.
export const text = (
  max: number,
): z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodString> =>
  z.string().transform(decodeTextEscapes).pipe(z.string().trim().min(1).max(max));
