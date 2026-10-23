import type { TextMasker } from '../guards/secret-masker.js';

// ADR-013, RF-507: model text is text. This is the one place that turns it into Markdown that
// shows the characters and nothing else, so only the links Rosetta builds itself (the RF-125
// permalinks and the relative card links) are live. Every piece of model text in a card file and
// in spec.md goes through here.

/** HTML is shown, never interpreted: `&`, `<` and `>` become entities. */
function entities(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Every Markdown punctuation character that can start syntax gets a backslash; `=` and `-` too,
 * so a line of them cannot underline the line above as a setext heading.
 */
function punctuation(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-=!|~]/g, '\\$&');
}

/** Bare URLs, `www.` hosts and e-mail addresses would be linked by many viewers. */
function breakAutolinks(text: string): string {
  return text
    .replace(/\b(https?|ftp|mailto):/gi, '$1&#58;')
    .replace(/www\./gi, 'www&#46;')
    .replaceAll('@', '&#64;');
}

function escapeLine(line: string): string {
  const escaped = breakAutolinks(punctuation(entities(line)));
  return escaped.replace(/^(\s*\d+)([.)])/, '$1\\$2');
}

/** One line of text: white space (and so line breaks) collapses to single spaces. */
function escapeInline(text: string): string {
  return escapeLine(text.replace(/\s+/g, ' ').trim());
}

/** A block quote; every line of the text is escaped and starts with `> `. */
function escapeBlock(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => `> ${escapeLine(line)}`.trimEnd())
    .join('\n');
}

/** Text inside the brackets of a link Rosetta builds: only what could end or nest the link. */
export function escapeLabel(text: string): string {
  return entities(text.replace(/\s+/g, ' ').trim()).replace(/[\\`*_[\]!~]/g, '\\$&');
}

/** Escapes model text for Markdown; each piece is masked first, so no secret survives escaping. */
export interface MarkdownEscaper {
  inline(text: string): string;
  block(text: string): string;
  label(text: string): string;
  url(text: string): string;
}

export function markdownEscaper(masker: TextMasker): MarkdownEscaper {
  const masked = (text: string): string => masker.mask(text).text;
  return {
    inline: (text) => escapeInline(masked(text)),
    block: (text) => escapeBlock(masked(text)),
    label: (text) => escapeLabel(masked(text)),
    url: (text) => escapeInline(masked(text)),
  };
}
