import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { ModelList } from '../../application/models/model-list.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-405, DEC-156: the model list file (`prices/models.yaml`): `{ schemaVersion, version (date),
// models: [{ provider, model, label }] }`. Only providers that sell a fixed set of models are
// listed. A file that cannot be read, does not match, or lists a model twice is refused with
// RST-1602 (the same code as the price table it sits beside) rather than guessed, so the dropdown
// never offers a wrong name.

const modelListSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  models: z.array(
    z.strictObject({
      provider: z.enum(['anthropic', 'openai']),
      model: z.string().min(1).max(200),
      label: z.string().min(1).max(100),
    }),
  ),
});

function invalid(message: string, cause?: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.priceTableInvalid, message, { cause });
}

function readYaml(text: string): unknown {
  try {
    const value: unknown = parse(text);
    return value;
  } catch (error) {
    throw invalid('The model list is not valid YAML.', error);
  }
}

/** The model list in the text of a list file (RF-405). */
// RF-405
export function parseModelList(text: string): ModelList {
  const parsed = modelListSchema.safeParse(readYaml(text));
  if (!parsed.success) throw invalid('The model list does not match its schema.', parsed.error);
  const seen = new Set<string>();
  for (const { provider, model } of parsed.data.models) {
    const key = `${provider}\n${model}`;
    if (seen.has(key)) throw invalid(`The model list names ${provider} ${model} twice.`);
    seen.add(key);
  }
  return { version: parsed.data.version, models: parsed.data.models };
}

/** Reads and parses a list file; RST-1602 when it is missing or invalid. */
// RF-405
export async function loadModelList(path: string): Promise<ModelList> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw invalid('The model list could not be read.', error);
  }
  return parseModelList(text);
}
