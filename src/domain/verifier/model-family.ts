// RF-301, DEC-57 (judge hygiene): a model tends to agree with text written by a model of its own
// family (self-preference), so a run whose `verifier` uses the `reader`'s family is warned. The
// family of a model id is read from the id alone, whichever provider serves it: its last path part
// (`meta-llama/Llama-3.1-8B` -> `Llama-3.1-8B`), in lower case, up to its first character that is
// not a letter (`gemma4:e4b` -> `gemma`, `gpt-4o-mini` -> `gpt`, `claude-sonnet-4-5` -> `claude`).
// OpenAI's reasoning models (`o1`, `o3`, `o4-mini`) are the `gpt` family. An id that does not
// start with a letter is its own family.

const openAiReasoning = /^o\d/u;
const leadingLetters = /^[a-z]+/u;

/** The family name of a model id, for the self-preference check. */
// RF-301
export function modelFamilyOf(model: string): string {
  const name = (model.trim().split('/').at(-1) ?? '').toLowerCase();
  if (openAiReasoning.test(name)) return 'gpt';
  return leadingLetters.exec(name)?.[0] ?? name;
}

/** Whether two model ids belong to one family (RF-301: the reader and the verifier). */
// RF-301
export function sameModelFamily(first: string, second: string): boolean {
  return modelFamilyOf(first) === modelFamilyOf(second);
}
