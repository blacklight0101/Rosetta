import type { JSX } from 'preact';
import type { ApiProblem } from '../api/client.js';

// design-system.md sections 5 and 7, RNF-008: an error callout with the `RST` code, what
// happened and what to do. The text is the catalogue's own, never a stack or a server detail.

export interface ErrorBannerProps {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly nextStep: string;
    readonly problems?: readonly ApiProblem[] | undefined;
  };
}

// RNF-008
export function ErrorBanner({ error }: ErrorBannerProps): JSX.Element {
  const problems = error.problems ?? [];
  return (
    <section class="rst-callout rst-callout--error" role="alert" data-testid="error-banner">
      <p class="rst-callout__message">
        <span class="rst-mono rst-callout__code" data-testid="error-banner-code">
          {error.code}
        </span>{' '}
        {error.message}
      </p>
      <p class="rst-callout__next-step" data-testid="error-banner-next-step">
        {error.nextStep}
      </p>
      {problems.length === 0 ? null : (
        <ul class="rst-callout__problems" data-testid="error-banner-problems">
          {problems.map((problem) => (
            <li key={`${problem.field}-${problem.code}`}>
              <span class="rst-mono">{problem.field}</span>{' '}
              <span class="rst-mono">{problem.code}</span> {problem.message} {problem.nextStep}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
