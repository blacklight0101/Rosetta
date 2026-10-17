// RF-508, P2-21: hostile names for the property tests of the diagram generators, drawn from a
// seeded generator so a failure is repeatable. Each name is a run of pieces that try to end a
// diagram, open a statement, add a link or a click, carry HTML, or pass for syntax with a
// look-alike character.

const pieces: readonly string[] = [
  'end',
  'subgraph',
  'click',
  'href',
  'call',
  'style',
  'classDef',
  'participant',
  'Note',
  'loop',
  'as',
  'direction',
  'redirection',
  'DIRECTION',
  'direction TB',
  'direction  LR',
  'redirection BTN',
  'Sort direction lr',
  'Text DIRECTION Rlx',
  'direction TD',
  ' TB',
  ' BT',
  ' RL',
  ' LR',
  ' TD',
  ' lr',
  'Rlx',
  'accTitle: t',
  'accDescr {',
  'linkStyle',
  'interpolate',
  'default',
  '%%',
  '%%{init: {"securityLevel":"loose"}}%%',
  '-->',
  '->>',
  '-.->',
  '==>',
  '---',
  '||--o{',
  '}|..|{',
  ';',
  ':',
  '\n',
  '\r\n',
  String.fromCodePoint(0x2028),
  String.fromCodePoint(0x2029),
  '\t',
  '\u0000',
  '"',
  "'",
  '`',
  '```',
  '[',
  ']',
  '(',
  ')',
  '{',
  '}',
  '|',
  '<',
  '>',
  '&',
  '#',
  '#59;',
  '&lt;',
  '&#60;',
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '[x](javascript:alert(1))',
  '**b**',
  '\\',
  ' ',
  '  ',
  '.',
  ',',
  'a',
  'Z',
  '0',
  String.fromCodePoint(0xff1c),
  String.fromCodePoint(0xff02),
  String.fromCodePoint(0xff1b),
  String.fromCodePoint(0x37e),
  String.fromCodePoint(0x430),
  String.fromCodePoint(0x200b),
  String.fromCodePoint(0x202e),
  String.fromCodePoint(0xa0),
  '\u{1F600}',
  '\uD800',
  String.fromCodePoint(0xe9),
];

/** Park-Miller: exact in double arithmetic, so the same seed gives the same names everywhere. */
export function seededNames(seed: number): () => string {
  let state = seed;
  const next = (bound: number): number => {
    state = (state * 48271) % 2147483647;
    return state % bound;
  };
  return () => {
    const count = next(7);
    let name = '';
    for (let index = 0; index < count; index += 1) name += pieces[next(pieces.length)] ?? '';
    return name;
  };
}

/** What a reader sees for a name: the name itself, a space when it is empty. */
export function shown(name: string): string {
  return name === '' ? ' ' : name.toWellFormed();
}
