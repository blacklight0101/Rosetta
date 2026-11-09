import type { JSX } from 'preact';
import { Link } from '../components/Link.js';
import type { JourneyView } from '../lib/journey/journey-steps.js';

// RF-1021, RF-615 (Q-44), DEC-211 (P8-26, P8Project): the Questions block of the project page after the
// brief was saved: the questions that were left on their recommended answers, and the way to review
// them. While the questions are still to be answered the strip holds them in place.

// RF-1021
export function ProjectQuestions({ view }: { readonly view: JourneyView }): JSX.Element | null {
  const { source, briefSaved } = view.facts;
  if (source === null || !briefSaved || source.openQuestions === 0) return null;
  const count = source.openQuestions;
  return (
    <section class="rst-card rst-p826-block" aria-labelledby="questions-heading">
      <h2 id="questions-heading" class="rst-settings__heading">
        Questions
      </h2>
      <span>
        {count === 1
          ? '1 question was left on its recommended answer.'
          : `${String(count)} questions were left on their recommended answers.`}
      </span>
      <span class="rst-p826-spacer" />
      <Link class="rst-button rst-button--secondary" href={`/runs/${source.id}`}>
        Review the answers
      </Link>
    </section>
  );
}
