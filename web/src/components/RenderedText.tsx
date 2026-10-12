import type { JSX } from 'preact';
import { splitText } from '../lib/safe-text.js';

// RF-507: the one way to show repository and model text. Everything is a text node; only
// https://github.com/ links become anchors (the rest of a Markdown link stays visible text).

export interface RenderedTextProps {
  readonly text: string;
}

// RF-507
export function RenderedText({ text }: RenderedTextProps): JSX.Element {
  return (
    <span class="rst-rendered-text" data-testid="rendered-text">
      {splitText(text).map((part, index) =>
        part.kind === 'text' ? (
          part.text
        ) : (
          <a key={index} href={part.href} rel="noopener noreferrer" target="_blank">
            {part.label}
          </a>
        ),
      )}
    </span>
  );
}
