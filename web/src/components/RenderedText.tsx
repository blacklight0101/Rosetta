import type { JSX } from 'preact';
import { splitText, type TextPart } from '../lib/safe-text.js';

// RF-507: the one way to show repository and model text. Everything is a text node; only
// https://github.com/ links become anchors (the rest of a Markdown link stays visible text), and
// `inline code` between backticks is a `code` element holding a text node (RNF-010), never markup.

export interface RenderedTextProps {
  readonly text: string;
}

function Part({ part }: { readonly part: TextPart }): JSX.Element {
  if (part.kind === 'text') return <>{part.text}</>;
  if (part.kind === 'code') return <code class="rst-rendered-text__code">{part.text}</code>;
  return (
    <a href={part.href} rel="noopener noreferrer" target="_blank">
      {part.label}
    </a>
  );
}

// RF-507
export function RenderedText({ text }: RenderedTextProps): JSX.Element {
  return (
    <span class="rst-rendered-text" data-testid="rendered-text">
      {splitText(text).map((part, index) => (
        <Part key={index} part={part} />
      ))}
    </span>
  );
}
