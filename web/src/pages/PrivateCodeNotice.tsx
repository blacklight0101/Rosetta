import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { Glyph } from '../components/Glyph.js';

// RF-132, RF-1001, design-system.md section 14 (Start run): the second notice, for a project of kind
// `upload` whose roles would send code to a cloud provider. It names the project and every provider
// in plain words, holds its own checkbox, separate from the cloud consent (CloudNotice.tsx), and
// offers one button that switches every role to Ollama. The server enforces it too (RST-1521).

export interface PrivateCodeNoticeProps {
  readonly projectName: string;
  /** RF-157: the data is Excel workbooks, so the wording names cell values, formulas and macros. */
  readonly workbooks?: boolean;
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

// RF-132 wording for code; RF-157 wording for Excel workbooks.
const CODE_WORDS = {
  title: 'Your code is private.',
  sent: (name: string) => `Excerpts of your own code from ${name}`,
  understood: (name: string) => `my own code from ${name}`,
} as const;
const WORKBOOK_WORDS = {
  title: 'Your workbook data is private.',
  sent: (name: string) => `Cell values, formulas and macros from ${name}`,
  understood: (name: string) => `cell values, formulas and macros from ${name}`,
} as const;

// RF-132
export function PrivateCodeNotice(props: PrivateCodeNoticeProps): JSX.Element {
  const { projectName, providers, confirmed, error } = props;
  const words = props.workbooks === true ? WORKBOOK_WORDS : CODE_WORDS;
  return (
    <section class="rst-callout rst-callout--warn" aria-labelledby={titleId}>
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="warning-triangle" />
        </span>
        <div class="rst-callout__body">
          <p>
            <strong id={titleId}>{words.title}</strong> {words.sent(projectName)} will be sent to{' '}
            {providers}.
          </p>
          <Field
            kind="checkbox"
            id="private-code-confirm"
            label={`I understand that ${words.understood(projectName)} will be sent to ${providers}`}
            checked={confirmed}
            error={error}
            announce={false}
            onChange={props.onConfirm}
          />
          <p>
            <Button variant="ghost" busy={props.switching} onClick={props.onSwitch}>
              Switch every role to Ollama
            </Button>{' '}
            Models then run on the Ollama server of this installation.
          </p>
          {props.switchError === undefined ? null : <ErrorBanner error={props.switchError} />}
        </div>
      </div>
    </section>
  );
}
