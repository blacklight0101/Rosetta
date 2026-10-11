import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { toolsPlaceholder } from './text-tool-protocol.js';

// RF-205, RNF-004: the text tool protocol is a versioned prompt file, not a string in code. A
// change creates a new version file and this name changes with it.

const textToolProtocolPrompt = 'shared/text-tool-protocol.v1.md';

/** Reads the protocol prompt from the prompts folder; it must hold the tools placeholder. */
export async function loadTextToolProtocol(promptsFolder: string): Promise<string> {
  const path = join(promptsFolder, textToolProtocolPrompt);
  const text = await readFile(path, 'utf8');
  if (!text.includes(toolsPlaceholder)) {
    throw new RosettaError(
      ERROR_CODES.configurationInvalid,
      `The prompt ${textToolProtocolPrompt} has no ${toolsPlaceholder} placeholder.`,
    );
  }
  return text;
}
