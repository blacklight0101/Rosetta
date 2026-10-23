import { parse } from 'yaml';
import { z } from 'zod';
import { holdsDataMarker } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { keepLegacyDefault } from '../../domain/planning/legacy-default.js';
import { stackLayers } from '../../domain/planning/planning-brief.js';
import type { StackRule, StackTechnology } from '../../domain/planning/stack-data.js';

// RF-609, RNF-004: the two stack files of the catalogue, `stack-technologies.v<n>.yaml` and
// `stack-rules.v<n>.yaml`. Anything that does not fit the shapes below is refused with RST-1000
// rather than half read, so a stack check never runs on a broken table.

const layer = z.enum(stackLayers);
const trait = z.enum(['server-rendered', 'single-page', 'api-only']);

const technologySchema = z.strictObject({
  layer,
  name: z.string().trim().min(1).max(80),
  aliases: z.array(z.string().trim().toLowerCase().min(1).max(60)).min(1).max(10),
  traits: z.array(trait).max(3),
  description: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((text) => !text.includes('\n'), 'must be one line'),
});

const conditionSchema = z.union([
  z.strictObject({ on: z.literal('trait'), layer, trait, present: z.boolean() }),
  z.strictObject({ on: z.literal('contract'), present: z.boolean() }),
]);

const ruleSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  matches: z.array(conditionSchema).min(1).max(6),
  clash: z.string().trim().min(1).max(500),
  question: z.string().trim().min(1).max(500),
  answer: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((text) => text.startsWith(keepLegacyDefault), 'must keep the legacy behaviour'),
});

function invalid(name: string, problem: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.configurationInvalid,
    `The catalogue file ${name} ${problem}.`,
    { cause },
  );
}

function listOf(name: string, text: string, key: string): unknown[] {
  if (holdsDataMarker(text)) throw invalid(name, 'holds a data block marker');
  let document: unknown;
  try {
    document = parse(text);
  } catch (error) {
    throw invalid(name, 'is not valid YAML', error);
  }
  const shape = z.strictObject({ [key]: z.array(z.unknown()).min(1).max(200) });
  const parsed = shape.safeParse(document);
  if (!parsed.success) throw invalid(name, `must hold a list ${key}`);
  return parsed.data[key] ?? [];
}

function itemsOf<T>(name: string, items: unknown[], schema: z.ZodType<T>): T[] {
  return items.map((item) => {
    const parsed = schema.safeParse(item);
    if (!parsed.success) throw invalid(name, 'has an entry that breaks its shape', parsed.error);
    return parsed.data;
  });
}

/** The technologies of `stack-technologies.v<n>.yaml`. */
// RF-609
export function parseStackTechnologies(name: string, text: string): StackTechnology[] {
  return itemsOf(name, listOf(name, text, 'technologies'), technologySchema);
}

/** The rules of `stack-rules.v<n>.yaml`; a repeated rule id is refused. */
// RF-609
export function parseStackRules(name: string, text: string): StackRule[] {
  const rules = itemsOf(name, listOf(name, text, 'rules'), ruleSchema);
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) {
    throw invalid(name, 'repeats a rule id');
  }
  return rules;
}
