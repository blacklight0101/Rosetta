import type { JSX } from 'preact';

// design-system.md section 9: inline SVG only, drawn here, colour `currentColor`, hidden from
// assistive technology because the word next to it carries the meaning.

export type GlyphName =
  | 'check'
  | 'cross'
  | 'open-circle'
  | 'dashed-circle'
  | 'live-dot'
  | 'broken-link'
  | 'question'
  | 'clock'
  | 'brackets'
  | 'exclamation'
  | 'square'
  | 'pause-bars'
  | 'retry-arrow'
  | 'warning-triangle'
  | 'play'
  | 'step-back'
  | 'step-forward';

const stroke = { fill: 'none', stroke: 'currentColor' } as const;

const drawings: Readonly<Record<GlyphName, JSX.Element>> = {
  check: <path d="M2 6.5 5 9l5-6" {...stroke} stroke-width="1.8" />,
  cross: <path d="M3 3l6 6M9 3 3 9" {...stroke} stroke-width="1.8" />,
  'open-circle': <circle cx="6" cy="6" r="4.5" {...stroke} stroke-width="1.5" />,
  'dashed-circle': (
    <circle cx="6" cy="6" r="4.5" {...stroke} stroke-width="1.5" stroke-dasharray="2 2" />
  ),
  'live-dot': <circle cx="6" cy="6" r="4" fill="currentColor" />,
  'broken-link': (
    <path
      d="M4 8 2.5 9.5a2 2 0 0 1-2.8-2.8L1.5 5M8 4l1.5-1.5a2 2 0 0 0-2.8-2.8L5 1.5M3 9 9 3"
      {...stroke}
      stroke-width="1.5"
      transform="translate(1 1) scale(0.85)"
    />
  ),
  question: (
    <path
      d="M4.2 4.4a1.9 1.9 0 1 1 2.6 1.7c-.6.3-.8.6-.8 1.2M6 9.3v.2"
      {...stroke}
      stroke-width="1.5"
    />
  ),
  clock: (
    <>
      <path d="M6 2v4l2.5 1.5" {...stroke} stroke-width="1.5" />
      <circle cx="6" cy="6" r="4.5" {...stroke} stroke-width="1.2" />
    </>
  ),
  brackets: <path d="M4 3 1.5 6 4 9M8 3l2.5 3L8 9" {...stroke} stroke-width="1.5" />,
  exclamation: <path d="M6 2.5v4.5M6 9v.3" {...stroke} stroke-width="1.8" />,
  square: <rect x="2.5" y="2.5" width="7" height="7" fill="currentColor" />,
  'pause-bars': <path d="M4 3v6M8 3v6" {...stroke} stroke-width="1.8" />,
  'retry-arrow': <path d="M9.5 5A3.5 3.5 0 1 0 9 8M9.5 2.5V5H7" {...stroke} stroke-width="1.4" />,
  'warning-triangle': (
    <path d="M6 1.8 11 10H1L6 1.8ZM6 5v2.2M6 8.6v.2" {...stroke} stroke-width="1.4" />
  ),
  play: <path d="M3.5 2.5v7L9.5 6 3.5 2.5Z" fill="currentColor" />,
  'step-back': <path d="M3 2.5v7M9.5 2.5v7L4.5 6l5-3.5Z" {...stroke} stroke-width="1.5" />,
  'step-forward': <path d="M9 2.5v7M2.5 2.5v7L7.5 6l-5-3.5Z" {...stroke} stroke-width="1.5" />,
};

export interface GlyphProps {
  readonly name: GlyphName;
}

export function Glyph({ name }: GlyphProps): JSX.Element {
  return (
    <svg
      class={name === 'live-dot' ? 'rst-glyph rst-live-dot' : 'rst-glyph'}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      {drawings[name]}
    </svg>
  );
}
