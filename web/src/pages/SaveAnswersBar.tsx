import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import type { SaveAnswers } from './use-save-answers.js';

// RF-1007, RF-647 (P8-86, UX-24, P8Run artboard): the bar under the questions that wait, above the
// collapsed "Answered" list: "Save answers (N)" first, then "Accept the recommended answers" while a
// question with suggested answers waits. Plan setup has its own Accept, which also writes the brief,
// so its list shows Save answers alone, as a secondary button beside the screen's main one.

interface SaveAnswersBarProps {
  readonly batch: SaveAnswers;
  /** Shows "Accept the recommended answers" beside Save answers. */
  readonly offerAccept: boolean;
  /** Save answers is the main button of the list; false where the screen has its own. */
  readonly main: boolean;
}

// RF-1007
export function SaveAnswersBar({ batch, offerAccept, main }: SaveAnswersBarProps): JSX.Element {
  return (
    <div class="rst-p139-save" data-testid="save-answers">
      {batch.failure === undefined ? null : <ErrorBanner error={batch.failure} />}
      <div class="rst-p139-save__buttons">
        <Button
          variant={main ? 'primary' : 'secondary'}
          busy={batch.busy}
          onClick={() => {
            void batch.save();
          }}
        >
          {`Save answers (${String(batch.count)})`}
        </Button>
        {offerAccept ? (
          <Button
            variant="secondary"
            busy={batch.busy}
            onClick={() => {
              void batch.accept();
            }}
          >
            Accept the recommended answers
          </Button>
        ) : null}
      </div>
    </div>
  );
}
