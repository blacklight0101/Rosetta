import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getErrorDescription, type ErrorDescription } from '../api/error-catalogue.js';
import { useApp } from '../app/app-context.js';
import { Link } from '../components/Link.js';
import { fixFor, GENERIC_FAILURE, nextStepFor } from '../lib/live-run/run-failures.js';

// RF-1108, RNF-008: a run that ended with an error shows the code, what it means and what to do, as
// every error of the application does: the words are the server's catalogue for any code (read from
// GET /api/errors/:code; the generic text shows until it answers, or when it cannot). A run refused
// for a missing provider key (RST-2302) links to the settings where the key is saved.

function useDescription(code: string): ErrorDescription {
  const { client } = useApp();
  const [found, setFound] = useState<ErrorDescription | undefined>(undefined);
  useEffect(() => {
    const abort = new AbortController();
    void getErrorDescription(client, code, abort.signal).then((result) => {
      if (!abort.signal.aborted && result.ok) setFound(result.value);
    });
    return () => {
      abort.abort();
    };
  }, [client, code]);
  return found ?? GENERIC_FAILURE;
}

// RF-1108
export function RunFailure({
  code,
  stage = 'understand',
}: {
  readonly code: string;
  /** EV-13: the stage of the run; a plan run never points to Resume. */
  readonly stage?: string;
}): JSX.Element {
  const text = useDescription(code);
  const fix = fixFor(code);
  return (
    <section class="rst-callout rst-callout--error" data-testid="run-failure">
      <p class="rst-callout__message">
        <span class="rst-mono rst-callout__code">{code}</span> {text.message}
      </p>
      <p class="rst-callout__next-step">
        {nextStepFor(stage, text.nextStep)}
        {fix === undefined ? null : (
          <>
            {' '}
            <Link href={fix.href}>{fix.label}</Link>
          </>
        )}
      </p>
    </section>
  );
}
