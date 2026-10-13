// RF-141: two spellings of one path that a file system treats as one file (case, Unicode form,
// path separator, trailing dots and spaces that Windows strips, Turkish dotted and dotless i), as
// [name, first spelling, later spelling]. A key left open under the first continues under the later.
export const sameFileSpellings: readonly (readonly [string, string, string])[] = [
  ['in another case', 'src/Web.config', 'SRC/web.CONFIG'],
  ['in another Unicode form', 'src/Caf\u00e9/Web.config', 'src/Cafe\u0301/Web.config'],
  ['with a trailing dot', 'src/Web.config', 'src/Web.config.'],
  ['with a trailing dot in the first read', 'src/Web.config.', 'src/Web.config'],
  ['with trailing dots and spaces', 'src/Web.config', 'src/Web.config. . '],
  ['with a trailing dot on a folder', 'src/a/Web.config', 'src/a./Web.config'],
  ['with a Turkish capital dotted I', 'src/\u0130.config', 'src/i.config'],
  ['with a Turkish small dotless i', 'src/\u0131.config', 'src/I.config'],
  ['with a Turkish dotted I in the later read', 'src/i.config', 'src/\u0130.config'],
];
