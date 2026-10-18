// RF-604: a cut-off planner answer is shown to the model again only up to the last complete JSON
// value boundary, so the model writes the cut string or number again whole and the join never has
// to guess where text that continues a string begins. Pure text scanning.

const jsonOpening = /[{[]\s*(?:["{[\]}]|$)/;
const partialToken = /[\w.+-]+$/u;

interface Scan {
  containers: number;
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
  } else if (char === '{' || char === '[') scan.containers += 1;
  else if (char === '}' || char === ']') scan.containers -= 1;
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
  const scan: Scan = { containers: 0, inString: false, escaped: false, stringAt: -1 };
  for (let index = start; index < text.length; index += 1) {
    step(scan, text[index] ?? '', index);
  }
  if (scan.inString) return text.slice(0, scan.stringAt);
  if (scan.containers <= 0) return text;
  return text.replace(partialToken, '');
}
