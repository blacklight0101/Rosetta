// RF-508, ADR-013, DEC-134: the one escaping function every label of a generated Mermaid diagram
// goes through. Text from the analysed code is untrusted, so the label keeps only ASCII letters,
// digits, inner spaces, `.` and `,` as they are, and writes every other character as a Mermaid
// entity code (`#59;` for `;`). Mermaid turns a code back into an HTML character reference after
// parsing, so the reader sees the text as written while the parser never sees a quote, bracket,
// arrow, `%%`, `;`, `#`, backtick, line break or look-alike that could end the label, the
// statement or the diagram, open a link, a click or a directive, or carry HTML. Leading and
// trailing spaces are coded too, so the parser cannot trim them; an empty label is a coded space,
// since Mermaid refuses an empty one; a lone surrogate becomes U+FFFD.

const literal = /^[A-Za-z0-9 .,]$/u;

function entityCode(char: string): string {
  return `#${String(char.codePointAt(0))};`;
}

// RF-508
export function mermaidLabel(text: string): string {
  // Code points, not graphemes: each one gets its own code, so a joined emoji stays as written.
  const chars = Array.from(text.toWellFormed());
  if (chars.length === 0) return entityCode(' ');
  const first = chars.findIndex((char) => char !== ' ');
  const last = chars.findLastIndex((char) => char !== ' ');
  return chars
    .map((char, index) => {
      const inner = index >= first && index <= last;
      return inner && literal.test(char) ? char : entityCode(char);
    })
    .join('');
}
