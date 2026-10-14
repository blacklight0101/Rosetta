/** Small parsers for the release documents and the README quick start (RF-801, DEC-29). Pure string functions. */

export interface FencedBlock {
  /** The first word of the info string in lower case, for example "powershell"; empty when none. */
  readonly lang: string;
  readonly body: string;
}

export interface MatrixRow {
  readonly id: string;
  /** The last column: "Tests pass", "Tests pass; manual check pending", "**Gap**" and so on. */
  readonly state: string;
}

const HYPHENS = /[‐-―−﹘﹣－]/gu;
const ID = /\b(?:RF|RNF)-\d{3,4}\b/giu;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>()[\]"'`]+/giu;
const HOST = /\b(?:[a-z0-9-]+\.)+(?:io|com|org|net|dev|app|me|ai|cloud|page|site)\b/giu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;

/** Line endings as LF and every hyphen look-alike as "-", so a variant cannot hide an id or a heading. */
export function normalize(text: string): string {
  return text.replace(/\r\n?/gu, '\n').replace(HYPHENS, '-');
}

/** The fenced code blocks of a Markdown text, in order. */
export function fencedBlocks(text: string): readonly FencedBlock[] {
  const blocks: FencedBlock[] = [];
  let open: { fence: string; lang: string; lines: string[] } | undefined;
  for (const line of normalize(text).split('\n')) {
    const marker = FENCE.exec(line)?.[1];
    if (open === undefined) {
      if (marker !== undefined) {
        const info = line.slice(line.indexOf(marker) + marker.length).trim();
        open = { fence: marker, lang: (info.split(/\s+/u)[0] ?? '').toLowerCase(), lines: [] };
      }
    } else if (marker?.startsWith(open.fence) === true && line.trim() === marker) {
      blocks.push({ lang: open.lang, body: open.lines.join('\n') });
      open = undefined;
    } else {
      open.lines.push(line);
    }
  }
  return blocks;
}

interface HeadedLine {
  readonly text: string;
  /** 1-6 for a heading line, 0 for any other line, including a "#" comment inside a fenced block. */
  readonly level: number;
}

/** The fence that is open after a line: the new marker when none was open, none when the line closes it. */
function nextFence(open: string | undefined, marker: string | undefined): string | undefined {
  if (open === undefined) return marker;
  return marker?.startsWith(open) === true ? undefined : open;
}

function withHeadingLevels(text: string): readonly HeadedLine[] {
  let open: string | undefined;
  return normalize(text)
    .split('\n')
    .map((line) => {
      const before = open;
      open = nextFence(open, FENCE.exec(line)?.[1]);
      const plain = before === undefined && open === undefined;
      return { text: line, level: plain ? (/^(#{1,6}) /u.exec(line)?.[1]?.length ?? 0) : 0 };
    });
}

/**
 * The text under a heading line (for example "## Quick start"), up to the next heading of the same or a
 * higher level. A "#" line inside a fenced block is a comment, not a heading. Empty when not found.
 */
export function section(text: string, heading: string): string {
  const lines = withHeadingLevels(text);
  const start = lines.findIndex((line) => line.level > 0 && line.text.trim() === heading);
  if (start < 0) return '';
  const level = lines[start]?.level ?? 0;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.level > 0 && line.level <= level);
  return (end < 0 ? rest : rest.slice(0, end)).map((line) => line.text).join('\n');
}

/** True when a link is one of the bare hosts, or is a listed address, or lies under one (any case). */
export function isPermittedLink(
  link: string,
  allowed: { readonly hosts: readonly string[]; readonly prefixes: readonly string[] },
): boolean {
  const lower = link.toLowerCase();
  return (
    allowed.hosts.includes(lower) ||
    allowed.prefixes.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`))
  );
}

/** Every requirement id (RF-nnn or RNF-nnn) in a text, upper case, in order of appearance, without repeats. */
export function requirementIds(text: string): readonly string[] {
  const found = normalize(text).match(ID) ?? [];
  return [...new Set(found.map((id) => id.toUpperCase()))];
}

/** True when the text writes two ids as a range such as "RF-100..RF-112", which hides the ids between. */
export function hasIdRange(text: string): boolean {
  const range =
    /\b(?:RF|RNF)-\d{3,4}\s*(?:\.\.|\u2026|-|\bto\b|\bthrough\b)\s*(?:RF-|RNF-)?\d{3,4}\b/iu;
  return range.test(normalize(text));
}

/** The rows of the requirement matrix table: the id of the first column and the last column as the state. */
export function matrixRows(text: string): readonly MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const line of normalize(text).split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const id = cells[1] ?? '';
    const state = cells[cells.length - 2] ?? '';
    if (/^(?:RF|RNF)-\d{3,4}$/u.test(id) && cells.length > 8) rows.push({ id, state });
  }
  return rows;
}

/** Every URL or bare host name in a text, as written, so a release note cannot carry an invented link. */
export function linksIn(text: string): readonly string[] {
  const clean = normalize(text);
  const urls = clean.match(URL) ?? [];
  const hosts = clean.replace(URL, ' ').match(HOST) ?? [];
  return [...urls, ...hosts].map((link) => link.replace(/[.,;:]+$/u, ''));
}
