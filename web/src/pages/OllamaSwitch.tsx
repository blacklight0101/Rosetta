import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { LOCAL_OLLAMA_MODEL } from './local-roles.js';

// RF-132, P8-82: the one button that puts every role on Ollama, the way out of the private-code
// notice. The start page and the Deepen panel draw it inside the notice; Plan setup draws it in
// its roles summary, away from the consent boxes and the start button (RF-605).

export interface OllamaSwitchProps {
  readonly onSwitch: () => void;
  readonly switching: boolean;
  /** Why the switch to Ollama failed. */
  readonly switchError: ApiFailure | undefined;
}

// RF-132
export function OllamaSwitch(props: OllamaSwitchProps): JSX.Element {
  return (
    <>
      <p>
        <Button variant="ghost" busy={props.switching} onClick={props.onSwitch}>
          {`Switch every role to Ollama (${LOCAL_OLLAMA_MODEL})`}
        </Button>{' '}
        Models then run on the Ollama server of this installation.
      </p>
      {props.switchError === undefined ? null : <ErrorBanner error={props.switchError} />}
    </>
  );
}
