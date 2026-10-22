import type { JSX } from 'preact';
import { Link } from './Link.js';

// DEC-161, design-system.md "Brand": the Rosetta icon (32 px, with its 2x source) before the live
// wordmark text. The name is written next to the icon, so the icon is decorative (empty alt); its
// width and height are set so the header does not shift while it loads. The full PNG logo is never
// used here: its dark navy wordmark is unreadable on the dark theme.

// RNF-010
export function Wordmark(): JSX.Element {
  return (
    <Link href="/" class="rst-wordmark">
      <img
        class="rst-wordmark__icon"
        src="/assets/brand/rosetta-icon-32.png"
        srcset="/assets/brand/rosetta-icon-64.png 2x"
        alt=""
        width="32"
        height="32"
      />
      Rosetta
    </Link>
  );
}
