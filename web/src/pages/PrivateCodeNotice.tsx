import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { Glyph } from '../components/Glyph.js';
import { LOCAL_OLLAMA_MODEL } from './local-roles.js';

// RF-132, RF-1001, design-system.md section 14 (Start run): the second notice, for a project of kind
// `upload` whose roles would send code to a cloud provider. It names the project and every provider
// in plain words, holds its own checkbox, separate from the cloud consent (CloudNotice.tsx), and
// offers one button that switches every role to Ollama. The server enforces it too (RST-1521).

export interface PrivateCodeNoticeProps {
  readonly projectName: string;
  /** The providers the roles use, for a sentence (`OpenAI and Anthropic`). */
  readonly providers: string;
  readonly confirmed: boolean;
  /** The server's refusal, shown next to the checkbox. */
  readonly error: { readonly code: string; readonly message: string } | undefined;
  readonly onConfirm: (checked: boolean) => void;
  readonly onSwitch: () => void;
  readonly switching: boolean;
  /** Why the switch to Ollama failed. */
  readonly switchError: ApiFailure | undefined;
}

const titleId = 'private-code-title';

// RF-132
export function PrivateCodeNotice(props: PrivateCodeNoticeProps): JSX.Element {
  const { projectName, providers, confirmed, error } = props;
  return (
    <section class="rst-callout rst-callout--warn" aria-labelledby={titleId}>
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="warning-triangle" />
        </span>
        <div class="rst-callout__body">
          <p>
            <strong id={titleId}>Your code is private.</strong> Excerpts of your own code from{' '}
            {projectName} will be sent to {providers}.
          </p>
          <Field
            kind="checkbox"
            id="private-code-confirm"
            label={`I understand that my own code from ${projectName} will be sent to ${providers}`}
            checked={confirmed}
            error={error}
            announce={false}
            onChange={props.onConfirm}
          />
          <p>
            <Button variant="ghost" busy={props.switching} onClick={props.onSwitch}>
              {`Switch every role to Ollama (${LOCAL_OLLAMA_MODEL})`}
            </Button>{' '}
            Models then run on the Ollama server of this installation.
          </p>
          {props.switchError === undefined ? null : <ErrorBanner error={props.switchError} />}
        </div>
      </div>
    </section>
  );
}
