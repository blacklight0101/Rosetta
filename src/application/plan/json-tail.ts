// RF-604: where a cut-off planner answer stops. Joining a continuation to it depends on whether
// the cut is inside a string, and inside a key or a value. Pure text scanning, no model text kept.

export interface JsonTail {
  /** The text ends inside a string of the JSON it started. */
  readonly inString: boolean;
  /** ... and that string is the key of an object member. */
  readonly inKey: boolean;
}

const jsonOpening = /[{[]\s*(?:["{[\]}]|$)/;

interface Scan {
  readonly containers: string[];
  last: string;
  inString: boolean;
  inKey: boolean;
  escaped: boolean;
}

function stepInString(scan: Scan, char: string): void {
  if (scan.escaped) scan.escaped = false;
  else if (char === '\\') scan.escaped = true;
  else if (char === '"') scan.inString = false;
}

function stepOutside(scan: Scan, char: string): void {
  if (/\s/u.test(char)) return;
  if (char === '"') {
    scan.inString = true;
    scan.inKey = scan.containers.at(-1) === '{' && (scan.last === '{' || scan.last === ',');
  } else if (char === '{' || char === '[') scan.containers.push(char);
  else if (char === '}' || char === ']') scan.containers.pop();
  scan.last = char;
}

/** Whether the text, read from the first JSON it starts, ends inside a string, and which. */
export function jsonTail(text: string): JsonTail {
  const start = text.search(jsonOpening);
  const scan: Scan = { containers: [], last: '', inString: false, inKey: false, escaped: false };
  if (start >= 0) {
    for (const char of text.slice(start)) {
      if (scan.inString) stepInString(scan, char);
      else stepOutside(scan, char);
    }
  }
  return { inString: scan.inString, inKey: scan.inString && scan.inKey };
}

const preamble =
  /^\s*(?:sure|certainly|of course|okay|ok|here(?:'s| is| are)|continuing)\b[^"\n]{0,80}:\s/iu;

/**
 * Whether the rest of a string that was cut off reads as prose of the model instead of the rest of
 * the string: an opening like "Sure, here is the rest: ", or, for a key, anything but one word.
 */
export function isProseRest(rest: string, inKey: boolean): boolean {
  if (preamble.test(rest)) return true;
  if (!inKey) return false;
  const end = rest.indexOf('"');
  return /[\s:,]/u.test(end < 0 ? rest : rest.slice(0, end));
}
