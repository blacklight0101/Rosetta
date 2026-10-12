import type { JSX } from 'preact';

// RF-1007: the open questions of an understand run on its live page (not built yet).

export interface RunAnswersProps {
  /** The run's id (the UUID). */
  readonly runId: string;
  readonly ended: boolean;
}

// RF-1007
export function RunAnswers(props: RunAnswersProps): JSX.Element {
  return (
    <section class="rst-card rst-p139-answers" aria-label="Open questions" data-run={props.runId}>
      <h2 class="rst-live-section__title">Open questions</h2>
    </section>
  );
}
