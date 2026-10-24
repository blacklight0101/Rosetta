// RF-604: a cut-off planner answer is shown to the model again only up to the last complete JSON
// value boundary, so the model writes the cut string or number again whole and the join never has
// to guess where text that continues a string begins. Pure text scanning.

const jsonOpening = /[{[]\s*(?:["{[\]}]|$)/;
const partialToken = /[\w.+-]+$/u;

interface Open {
  readonly char: string;
  readonly at: number;
}

interface Scan {
  containers: number;
  /** The containers still open, outermost first. */
  open: Open[];
  inString: boolean;
  escaped: boolean;
  stringAt: number;
}

function step(scan: Scan, char: string, index: number): void {
  if (scan.inString) {
    if (scan.escaped) scan.escaped = false;
    else if (char === '\\') scan.escaped = true;
    else if (char === '"') scan.inString = false;
  } else if (char === '"') {
    scan.inString = true;
    scan.stringAt = index;
  } else if (char === '{' || char === '[') {
    scan.containers += 1;
    scan.open.push({ char, at: index });
  } else if (char === '}' || char === ']') {
    scan.containers -= 1;
    scan.open.pop();
  }
}

/**
 * The answer up to its last complete JSON boundary: a cut inside a string goes back to before the
 * opening quote, a cut number or word to where it starts. Text that ends at a boundary, or holds
 * no open JSON, is returned as it is.
 */
// RF-604
export function resumePoint(text: string): string {
  const start = text.search(jsonOpening);
  if (start < 0) return text;
  const scan: Scan = { containers: 0, open: [], inString: false, escaped: false, stringAt: -1 };
  for (let index = start; index < text.length; index += 1) {
    step(scan, text[index] ?? '', index);
  }
  if (scan.inString) return text.slice(0, scan.stringAt);
  if (scan.containers <= 0) return text;
  return text.replace(partialToken, '');
}

/**
 * P5-38: where an object that is an element of a list starts, when `text` ends inside it at a place
 * that wants a key (after `{` or a comma). A fragment that starts a new `{` or `[` cannot go there:
 * the model has begun the next element instead of finishing this one. Null for any other end.
 */
// RF-604
export function openElementStart(text: string): number | null {
  const start = text.search(jsonOpening);
  const scan: Scan = { containers: 0, open: [], inString: false, escaped: false, stringAt: -1 };
  for (let index = Math.max(start, 0); start >= 0 && index < text.length; index += 1) {
    step(scan, text[index] ?? '', index);
  }
  const [outer, inner] = scan.open.slice(-2);
  const wantsKey = [',', '{'].includes(text.trimEnd().slice(-1));
  return !scan.inString && wantsKey && outer?.char === '[' && inner?.char === '{' ? inner.at : null;
}
