import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  parseProjectSettings,
  type ProjectSettings,
} from '../../application/projects/project-settings.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// Data-model.md section 10, RF-010: the default project settings (`project-settings.json`) and the
// default ignore rules (`ignore-rules.txt`) that ship in `templates/`. The rules become the
// `scan.ignoreRules` setting; the JSON file does not carry them. The joined document must pass the
// settings schema, otherwise the server does not start (RST-1000 naming the fields).

const templateFile = z.looseObject({ scan: z.looseObject({}) });

function invalid(message: string, cause?: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.configurationInvalid, message, { cause });
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw invalid(`The template file ${path} cannot be read.`, error);
  }
}

// RF-010
export async function loadProjectTemplate(folder: string): Promise<ProjectSettings> {
  const rules = await readText(join(folder, 'ignore-rules.txt'));
  const text = await readText(join(folder, 'project-settings.json'));
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw invalid('The template project-settings.json is not valid JSON.', error);
  }
  const file = templateFile.safeParse(json);
  if (!file.success)
    throw invalid('The template project-settings.json is not an object with scan.');
  const joined = { ...file.data, scan: { ...file.data.scan, ignoreRules: rules } };
  const settings = parseProjectSettings(joined);
  if (!settings.ok) {
    const fields = settings.error.map((problem) => problem.field).join(', ');
    throw invalid(`The default project settings are not valid: ${fields}.`);
  }
  return settings.value;
}
