import { describe, expect, it } from 'vitest';
import { mermaidLabel } from '../../../../src/domain/diagrams/mermaid-label.js';

// RF-508: the one escaping function every diagram label goes through. What it may leave as it is:
// ASCII letters, digits, inner spaces, `.` and `,`; everything else becomes a Mermaid entity code.
const labelShape = /^(?:[A-Za-z0-9 .,]|#\d+;)+$/;

const code = (char: string): string => `#${String(char.codePointAt(0))};`;

describe('mermaidLabel on syntax characters', () => {
  it('RF-508 keeps plain words, digits, inner spaces, dots and commas as they are', () => {
    expect(mermaidLabel('Order 66, step 1.')).toBe('Order 66, step 1.');
  });

  it.each([
    ['LF', '\n'],
    ['CR', '\r'],
    ['LINE SEPARATOR', String.fromCodePoint(0x2028)],
    ['PARAGRAPH SEPARATOR', String.fromCodePoint(0x2029)],
    ['TAB', '\t'],
    ['NUL', '\u0000'],
    ['NEL', '\u0085'],
  ])('RF-508 turns %s into an entity code so no new line or statement starts', (_name, char) => {
    expect(mermaidLabel(`a${char}b`)).toBe(`a${code(char)}b`);
  });

  it.each([';', '"', "'", '`', '[', ']', '(', ')', '{', '}', '<', '>', '|', ':', '-', '=', '&'])(
    'RF-508 turns the syntax character %s into an entity code',
    (char) => {
      expect(mermaidLabel(`a${char}b`)).toBe(`a${code(char)}b`);
    },
  );

  it.each(['#', '%', '@', '\\', '/', '*', '_', '~', '!', '?', '+', '$', '^'])(
    'RF-508 turns the character %s into an entity code',
    (char) => {
      expect(mermaidLabel(`a${char}b`)).toBe(`a${code(char)}b`);
    },
  );
});

describe('mermaidLabel on hostile text', () => {
  it('RF-508 a label cannot hold an arrow, a comment or an init directive', () => {
    const escaped = mermaidLabel('a --> b %%{init: {"securityLevel":"loose"}}%% ==> c -.-> d');

    expect(escaped).not.toMatch(/-|%|=|\{|\}|"|>/);
    expect(escaped).toMatch(labelShape);
  });

  it('RF-508 a label cannot carry HTML, an entity or a javascript link', () => {
    const escaped = mermaidLabel('<script>alert(1)</script>&lt;img onerror=x&gt; javascript:go()');

    expect(escaped).not.toMatch(/<|>|&|:|\(|\)/);
    expect(escaped).toContain('javascript#58;go#40;#41;');
  });

  it('RF-508 an entity code written in the code shows as typed, not as the character', () => {
    expect(mermaidLabel('#59;')).toBe('#35;59#59;');
  });

  it('RF-508 a Mermaid fence in a name cannot close the Markdown code block', () => {
    expect(mermaidLabel('```\n# Title')).toBe('#96;#96;#96;#10;#35; Title');
  });

  it('RF-508 keywords stay words but cannot carry a statement with them', () => {
    const escaped = mermaidLabel('end\nsubgraph x\nclick a href "javascript:x"\nstyle a fill:red');

    expect(escaped.split('\n')).toHaveLength(1);
    expect(escaped).toMatch(labelShape);
  });
});

describe('mermaidLabel on look-alikes and edge cases', () => {
  it.each([
    ['FULLWIDTH LESS-THAN', String.fromCodePoint(0xff1c)],
    ['FULLWIDTH QUOTATION MARK', String.fromCodePoint(0xff02)],
    ['FULLWIDTH SEMICOLON', String.fromCodePoint(0xff1b)],
    ['GREEK QUESTION MARK', String.fromCodePoint(0x37e)],
    ['SMALL FULL STOP', String.fromCodePoint(0xfe52)],
    ['CYRILLIC SMALL A', String.fromCodePoint(0x430)],
    ['ZERO WIDTH SPACE', String.fromCodePoint(0x200b)],
    ['RIGHT-TO-LEFT OVERRIDE', String.fromCodePoint(0x202e)],
    ['NO-BREAK SPACE', String.fromCodePoint(0xa0)],
  ])('RF-508 turns the look-alike %s into its own entity code', (_name, char) => {
    expect(mermaidLabel(`a${char}b`)).toBe(`a${code(char)}b`);
  });

  it('RF-508 keeps a character outside the basic plane as one entity code', () => {
    expect(mermaidLabel('a\u{1F600}b')).toBe('a#128512;b');
  });

  it('RF-508 replaces a lone surrogate by the replacement character', () => {
    expect(mermaidLabel('a\uD800b')).toBe('a#65533;b');
  });

  it('RF-508 keeps leading and trailing spaces as entity codes so they are not trimmed away', () => {
    expect(mermaidLabel('  a b ')).toBe('#32;#32;a b#32;');
  });

  it('RF-508 an empty label becomes one space, since an empty one does not parse', () => {
    expect(mermaidLabel('')).toBe('#32;');
  });

  it('RF-508 never lets a raw # or ; out except inside its own entity codes', () => {
    expect(mermaidLabel('#;##;;')).toBe('#35;#59;#35;#35;#59;#59;');
  });
});
