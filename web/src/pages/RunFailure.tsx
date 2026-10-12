import type { JSX } from 'preact';
import { Link } from '../components/Link.js';
import { failureTextFor } from '../lib/live-run/run-failures.js';

// RF-1108, RNF-008: a run that ended with an error shows the code, what it means and what to do, as
// every error of the application does. A run refused for a missing provider key (RST-2302) links to
// the settings where the key is saved.

// RF-1108
export function RunFailure({ code }: { readonly code: string }): JSX.Element {
  const text = failureTextFor(code);
  return (
    <section class="rst-callout rst-callout--error" data-testid="run-failure">
      <p class="rst-callout__message">
        <span class="rst-mono rst-callout__code">{code}</span> {text.message}
      </p>
      <p class="rst-callout__next-step">
        {text.nextStep}
        {text.fix === undefined ? null : (
          <>
            {' '}
            <Link href={text.fix.href}>{text.fix.label}</Link>
          </>
        )}
      </p>
    </section>
  );
}
