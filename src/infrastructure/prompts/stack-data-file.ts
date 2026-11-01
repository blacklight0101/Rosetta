import { parse } from 'yaml';
import { z } from 'zod';
import { holdsDataMarker } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { keepLegacyDefault } from '../../domain/planning/legacy-default.js';
import { stackLayers } from '../../domain/planning/planning-brief.js';
import type {
  KindSignal,
  LegacyTechnology,
  StackOption,
  StackProposals,
  StackRule,
  StackTechnology,
} from '../../domain/planning/stack-data.js';

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

const kind = z.enum(['web', 'desktop', 'service']);
const word = z.string().trim().toLowerCase().min(1).max(60);

const signalSchema = z.strictObject({
  kind,
  artefacts: z.array(word).max(10),
  extensions: z.array(word).max(20),
  suffixes: z.array(word).max(10),
});

const optionSchema = z.strictObject({
  kind,
  layer,
  legacy: z.array(word).max(10),
  choice: z.string().trim().min(1).max(80),
  why: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((text) => !text.includes('\n'), 'must be one line'),
});

const legacySchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  languages: z.array(word).max(10).default([]),
  extensions: z.array(word).max(10).default([]),
  layers: z.array(layer).max(7),
  endOfLife: z.boolean(),
});

function invalid(name: string, problem: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.configurationInvalid,
    `The catalogue file ${name} ${problem}.`,
    { cause },
  );
}

function documentOf(name: string, text: string): unknown {
  if (holdsDataMarker(text)) throw invalid(name, 'holds a data block marker');
  try {
    return parse(text);
  } catch (error) {
    throw invalid(name, 'is not valid YAML', error);
  }
}

function listOf(name: string, text: string, key: string): unknown[] {
  const document = documentOf(name, text);
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

/**
 * P5-39: the kind signals and the proposed options of `stack-proposals.v<n>.yaml`. An option whose
 * choice is not a technology of its layer in `technologies` is refused, so a proposal always names
 * something the stack records can describe.
 */
// RF-609
export function parseStackProposals(
  name: string,
  text: string,
  technologies: readonly StackTechnology[],
): StackProposals {
  const shape = z.strictObject({
    signals: z.array(z.unknown()).min(1).max(20),
    options: z.array(z.unknown()).min(1).max(200),
    legacy: z.array(z.unknown()).max(50).optional(),
  });
  const document = shape.safeParse(documentOf(name, text));
  if (!document.success) throw invalid(name, 'must hold the lists signals and options');
  const signals: KindSignal[] = itemsOf(name, document.data.signals, signalSchema);
  const options: StackOption[] = itemsOf(name, document.data.options, optionSchema);
  const legacy: LegacyTechnology[] = itemsOf(name, document.data.legacy ?? [], legacySchema);
  for (const option of options) {
    const known = technologies.some(
      (tech) => tech.layer === option.layer && tech.name === option.choice,
    );
    if (!known) throw invalid(name, 'proposes a technology the table of its layer does not hold');
  }
  return { signals, options, legacy };
}
