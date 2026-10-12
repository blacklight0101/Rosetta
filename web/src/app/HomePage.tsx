import type { JSX } from 'preact';
import { Link } from '../components/Link.js';

// The public start page until the landing page (P1-15) replaces it: the wordmark, the one-sentence
// promise and the way in. No account can be created here (RF-1102).

export function HomePage(): JSX.Element {
  return (
    <main class="rst-page rst-page--centered" id="main-content" tabIndex={-1}>
      <p class="rst-wordmark">Rosetta</p>
      <h1 class="rst-page__title">Turn a legacy codebase into a verified specification</h1>
      <p class="rst-page__lead">
        Rosetta reads a public GitHub repository, writes evidence-cited cards, checks every claim
        and prepares the hand-off for a modernisation team.
      </p>
      <p>
        <Link href="/sign-in" class="rst-button rst-button--primary">
          Sign in
        </Link>
      </p>
    </main>
  );
}
