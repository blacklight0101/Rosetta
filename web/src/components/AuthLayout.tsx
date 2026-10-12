import type { ComponentChildren, JSX } from 'preact';
import { Link } from './Link.js';

// design-system.md section 14 (sign in, change password): a page without the shell. The wordmark
// on the left, a slot on the right (a link on the sign-in page, the user and Sign out on the
// change-password page) and one centred card.

export interface AuthLayoutProps {
  /** The header's right-hand side. */
  readonly end: ComponentChildren;
  readonly children: ComponentChildren;
}

// RNF-010
export function AuthLayout({ end, children }: AuthLayoutProps): JSX.Element {
  return (
    <div class="rst-auth">
      <header class="rst-auth__header" role="banner">
        <Link href="/" class="rst-wordmark">
          Rosetta
        </Link>
        <span class="rst-header__spacer" />
        {end}
      </header>
      <main class="rst-auth__main" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
