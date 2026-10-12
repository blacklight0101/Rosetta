import type { PromptFile } from '../../../application/agent/prompt-file.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { loadPromptFile } from '../../prompts/prompt-files.js';
import { toolsPlaceholder } from './text-tool-protocol.js';

// RF-205, RNF-004: the text tool protocol is a versioned prompt file, not a string in code. A
// change creates a new version file and this name changes with it. The loader returns the version
// and the SHA-256 of the bytes for the run manifest with the text the model reads.

const textToolProtocolPrompt = 'shared/text-tool-protocol.v1.md';

/** Reads the protocol prompt from the prompts folder; it must hold the tools placeholder. */
export async function loadTextToolProtocol(promptsFolder: string): Promise<PromptFile> {
  const file = await loadPromptFile(promptsFolder, textToolProtocolPrompt);
  if (!file.text.includes(toolsPlaceholder)) {
    throw new RosettaError(
      ERROR_CODES.configurationInvalid,
      `The prompt ${textToolProtocolPrompt} has no ${toolsPlaceholder} placeholder.`,
    );
  }
  return file;
}
