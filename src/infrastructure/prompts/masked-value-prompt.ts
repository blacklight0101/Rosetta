import type { PromptFile } from '../../application/agent/prompt-file.js';
import { SecretMasker, type ReplacementOf } from '../guards/secret-masker.js';
import { loadPromptFile, loadPromptFileSync, requirePlaceholder } from './prompt-files.js';

// P5-34, RF-141, RNF-004: the text a masked value is replaced with is a versioned prompt file, not
// a string in code. It starts with `[MASKED:{{kind}}]` (the marker every rule and every reader of a
// masked text knows) and tells the model that a secret value is written there in the code in plain
// text and that Rosetta masked it before sending.

const maskedValuePromptName = 'shared/masked-value.v1.md';

/** The kind's place in the file; it must hold it exactly once. */
const KIND_PLACEHOLDER = '{{kind}}';

/** The prompt file of the replacement text, checked and hashed. */
// RNF-004
export async function loadMaskedValuePrompt(promptsFolder: string): Promise<PromptFile> {
  const file = await loadPromptFile(promptsFolder, maskedValuePromptName);
  return requirePlaceholder(file, KIND_PLACEHOLDER);
}

/** The replacement of every masked value: the file's one line with the kind put in. */
export function maskedValueReplacement(file: PromptFile): ReplacementOf {
  const line = file.text.trim();
  return (kind) => line.replace(KIND_PLACEHOLDER, () => kind);
}

/** The masker whose replacement is the note of the prompt file, read at once (RF-141). */
// RNF-004
export function explainedMasker(promptsFolder: string): SecretMasker {
  const file = requirePlaceholder(
    // eslint-disable-next-line n/no-sync -- one small file read before the server starts.
    loadPromptFileSync(promptsFolder, maskedValuePromptName),
    KIND_PLACEHOLDER,
  );
  return new SecretMasker(undefined, maskedValueReplacement(file));
}
