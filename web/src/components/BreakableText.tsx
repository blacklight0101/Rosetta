import { Fragment, type JSX } from 'preact';
import { breakablePieces } from '../lib/path-breaks.js';

// RNF-010, RF-507: text whose paths wrap at "/" and before ":". Each piece is a text node and the
// places between them are `<wbr>` elements, so the text stays text (never HTML) and its content is
// the same string. Used for paths and for lines that hold one.

// RNF-010
export function BreakableText({ text }: { readonly text: string }): JSX.Element {
  return (
    <>
      {breakablePieces(text).map((piece, index) => (
        <Fragment key={index}>
          {index === 0 ? null : <wbr />}
          {piece}
        </Fragment>
      ))}
    </>
  );
}
