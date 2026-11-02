import type { StackLayer } from './planning-brief.js';
import type { StackData, VagueWords } from './stack-data.js';
import { technologiesNamed } from './stack-catalogue.js';
import { typedText } from './typed-answers.js';

// P7-30, RF-609, RF-645, DEC-178: a typed answer for a stack layer that names only a platform (".net",
// "java") or a word with no technology ("default", "any") is not specific. The words are the `vague`
// list of `stack-proposals.v<n>.yaml`. An answer that names a technology of the layer (".net" for the
// language and runtime) is specific, whatever else it says.

/** The vague words an answer consists of for the layer; undefined when it is specific. */
export function vagueMatch(
  stack: StackData,
  layer: StackLayer,
  choice: string,
): VagueWords | undefined {
  const text = typedText(choice)
    .toLowerCase()
    .replace(/[.!?,;:\s]+$/u, '');
  if (text === '') return undefined;
  if (technologiesNamed(stack.technologies, layer, text).length > 0) return undefined;
  return stack.proposals.vague.find((each) => each.words.includes(text));
}
