import type { JSX } from 'preact';
import { EmptyState } from '../components/EmptyState.js';
import { Link } from '../components/Link.js';

// A path no route claims, or a page the signed-in role may not open: the same answer, so the page
// never says whether an administrator page exists (RF-1105).

export function NotFoundPage(): JSX.Element {
  return (
    <section class="rst-page">
      <h1 class="rst-page__title">Page not found</h1>
      <EmptyState message="This page does not exist, or you cannot open it.">
        <Link href="/" class="rst-button rst-button--secondary">
          Go to the start page
        </Link>
      </EmptyState>
    </section>
  );
}
