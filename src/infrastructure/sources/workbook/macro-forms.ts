import type { FormControl } from './macro-model.js';

// RF-154: a user form keeps its design in a storage named after the form; the stream
// `\x03VBFrame` in it is text that lists the form and every control as `Begin <type> <name>`.
// The controls are listed, not drawn. The text is cut by the caller's size limit before it gets here.

const BEGIN = /^\s*Begin\s+(\S+)\s+(\S+)/;

/** The controls of `form`, in file order; the first `Begin` is the form itself. */
export function controlsOf(form: string, frameText: string): FormControl[] {
  const controls: FormControl[] = [];
  let first = true;
  for (const line of frameText.split(/\r?\n/)) {
    const match = BEGIN.exec(line);
    if (match === null) continue;
    if (first) {
      first = false;
      continue;
    }
    controls.push({ form, type: match[1] ?? '', name: match[2] ?? '' });
  }
  return controls;
}
