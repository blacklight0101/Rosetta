import { languageByExtension, languageByInterpreter, languageByName } from './language-table.js';
import { baseName, extensionOf } from './path-parts.js';

// RF-101: language by extension, then by content for a file the extension does not settle.
// `unknown` is a valid answer.

const unknownLanguage = 'unknown';

const maxFirstLine = 200;

function interpreterLanguage(firstLine: string): string | undefined {
  const words = firstLine.slice(2).trim().split(' ');
  const program = baseName(words[0] ?? '');
  const name = program === 'env' ? baseName(words[1] ?? '') : program;
  return languageByInterpreter.find(([start]) => name.startsWith(start))?.[1];
}

/** For a file with no known extension: a `#!` line, a PHP or XML opening, or an ASP.NET directive. */
function languageOfHead(head: string): string | undefined {
  const text = head.trimStart();
  if (text.startsWith('#!')) {
    const end = text.indexOf('\n');
    return interpreterLanguage(text.slice(0, end < 0 ? maxFirstLine : Math.min(end, maxFirstLine)));
  }
  if (text.startsWith('<?php')) return 'php';
  if (text.startsWith('<?xml')) return 'xml';
  if (text.startsWith('<%@')) return 'aspnet';
  return undefined;
}

const cppMarkers = ['class ', 'namespace ', 'template<', 'template <', '<iostream>'];

/** A `.h` file is C unless its start shows C++. */
function refine(language: string, extension: string, head: string | undefined): string {
  const isCpp =
    extension === 'h' && head !== undefined && cppMarkers.some((marker) => head.includes(marker));
  return isCpp ? 'cpp' : language;
}

/** `head` is the start of the file's text, when it was read. */
export function detectLanguage(path: string, head?: string): string {
  const name = baseName(path).toLowerCase();
  const extension = extensionOf(name);
  const known = languageByName.get(name) ?? languageByExtension.get(extension);
  if (known !== undefined) return refine(known, extension, head);
  return (head === undefined ? undefined : languageOfHead(head)) ?? unknownLanguage;
}
