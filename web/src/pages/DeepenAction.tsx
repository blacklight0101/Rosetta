import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '../components/Button.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { cloudRoles } from '../lib/estimate-math.js';
import { allRoundsText, firstRoundText } from '../lib/understanding/deepen-estimate-text.js';
import { CloudNotice } from './CloudNotice.js';
import { DeepenEstimateView } from './DeepenEstimateView.js';
import { useDeepenEstimate, useDeepenStart, type DeepenEstimateLoad } from './use-deepen.js';

// RF-209, RF-1017, RF-143, DEC-144, DEC-145: the Deepen action of the "Your turn" panel of a run that
// ended Completed. It sends Rosetta back over what it did not confirm. The panel shows the round
// limit (1 to 5, default 3), the coverage pass (ticked unless the owner unticks it), the estimate
// of the first round and of all rounds against the run cap, and the consent where a provider is in
// the cloud. Nothing starts until the owner presses Start and confirms the question. All the styles
// are under `.rst-p241-`.

const roundChoices = ['1', '2', '3', '4', '5'] as const;
const consentCode = 'RST-1515';

interface PanelProps {
  readonly runId: string;
  readonly onClose: () => void;
}

function needsConsent(load: DeepenEstimateLoad): boolean {
  return load.status === 'ready' && cloudRoles(load.estimate).length > 0;
}

function reasonOf(load: DeepenEstimateLoad, consent: boolean): string | undefined {
  if (load.status === 'loading') return 'The estimate is being read.';
  if (load.status === 'failed') return 'The estimate could not be read.';
  if (needsConsent(load) && !consent) return 'Give the consent above first.';
  return undefined;
}

function Question(props: {
  readonly load: DeepenEstimateLoad;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element | null {
  const { load } = props;
  if (load.status !== 'ready') return null;
  return (
    <ConfirmDialog
      title="Start this Deepen?"
      confirmLabel="Confirm and start"
      confirmVariant="primary"
      busy={props.busy}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    >
      <p>{firstRoundText(load.estimate)}</p>
      <p>{allRoundsText(load.estimate)}</p>
    </ConfirmDialog>
  );
}

function Choices(props: { readonly runId: string }): JSX.Element {
  const deepen = useDeepenStart(props.runId);
  const { choice } = deepen;
  const load = useDeepenEstimate(props.runId, choice);
  const [asking, setAsking] = useState(false);
  // A refusal closes the question; the reason shows on the page, and Start asks again.
  useEffect(() => {
    if (deepen.error !== undefined) setAsking(false);
  }, [deepen.error]);
  const cloud = load.status === 'ready' ? cloudRoles(load.estimate) : [];
  const refused = deepen.error?.code === consentCode ? deepen.error : undefined;
  const reason = reasonOf(load, deepen.consent);
  return (
    <>
      <Field
        kind="select"
        id="deepen-rounds"
        label="Rounds at most"
        help="It stops earlier when a round adds nothing."
        value={String(choice.maxRounds)}
        options={roundChoices.map((each) => ({ value: each, label: each }))}
        onChange={(value) => {
          deepen.setChoice({ ...choice, maxRounds: Number(value) });
        }}
      />
      <Field
        kind="checkbox"
        id="deepen-coverage"
        label="Also read first-party files never read (coverage pass)"
        checked={choice.coveragePass}
        onChange={(checked) => {
          deepen.setChoice({ ...choice, coveragePass: checked });
        }}
      />
      <DeepenEstimateView load={load} />
      {cloud.length === 0 ? null : (
        <CloudNotice
          roles={cloud}
          consent={deepen.consent}
          error={refused}
          onConsent={deepen.setConsent}
        />
      )}
      {deepen.error === undefined || refused !== undefined ? null : (
        <ErrorBanner error={deepen.error} />
      )}
      <Button
        variant="primary"
        {...(reason === undefined ? {} : { disabledReason: reason })}
        onClick={() => {
          setAsking(true);
        }}
      >
        Start Deepen
      </Button>
      {asking ? (
        <Question
          load={load}
          busy={deepen.busy}
          onConfirm={deepen.start}
          onCancel={() => {
            setAsking(false);
          }}
        />
      ) : null}
    </>
  );
}

function Panel({ runId, onClose }: PanelProps): JSX.Element {
  return (
    <section class="rst-p241-panel" aria-label="Deepen this run">
      <Choices runId={runId} />
      <Button onClick={onClose}>Not now</Button>
    </section>
  );
}

// RF-209
export function DeepenAction({ runId }: { readonly runId: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <Panel
        runId={runId}
        onClose={() => {
          setOpen(false);
        }}
      />
    );
  }
  return (
    <div class="rst-p241-action">
      <p>
        Send Rosetta back over what it did not confirm. Nothing starts until you see the estimate
        and confirm.
      </p>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Deepen this run
      </Button>
    </div>
  );
}
