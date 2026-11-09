import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Button } from '../components/Button.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { cloudRoles } from '../lib/estimate-math.js';
import type { DeepenEstimate } from '../api/understanding.js';
import { confirmLineOf } from '../lib/understanding/deepen-estimate-text.js';
import { CloudNotice } from './CloudNotice.js';
import { ConsentLine } from './ConsentLine.js';
import { DeepenEstimateView } from './DeepenEstimateView.js';
import { PrivateCodeNotice } from './PrivateCodeNotice.js';
import { useDeepenPrivateCode, type DeepenPrivateCode } from './use-deepen-private-code.js';
import { useHeldConsent, type HeldConsentState } from './use-held-consent.js';
import {
  useDeepenEstimate,
  useDeepenStart,
  type DeepenEstimateLoad,
  type DeepenStart,
} from './use-deepen.js';

// RF-209, RF-1017, RF-143, DEC-144, DEC-145: the Deepen action of the "Your turn" panel of a run that
// ended Completed. It sends Rosetta back over what it did not confirm. The panel shows the round
// limit (1 to 5, default 3), the coverage pass (ticked unless the owner unticks it), the estimate
// of the first round and of all rounds against the run cap, and the consent where a provider is in
// the cloud. On an uploaded or workbook project whose roles are in the cloud, the private-code
// confirmation shows beside the consent from the start (RF-132, DEC-209, P8-79); while a consent of
// the project holds, one line with Withdraw shows instead of both (P8-81). Nothing starts until
// the owner presses Start and confirms the question. All the styles are under `.rst-p241-`.

const roundChoices = ['1', '2', '3', '4', '5'] as const;
const consentCode = 'RST-1515';
const privateCode = 'RST-1521';

interface PanelProps {
  readonly runId: string;
  readonly projectId: string;
  readonly onClose: () => void;
}

function reasonOf(
  load: DeepenEstimateLoad,
  deepen: DeepenStart,
  asked: { readonly consent: boolean; readonly privateShown: boolean },
): string | undefined {
  const { consent } = deepen;
  const { privateShown } = asked;
  if (load.status === 'loading') return 'The estimate is being read.';
  if (load.status === 'failed') return 'The estimate could not be read.';
  if (asked.consent && !consent) return 'Give the consent above first.';
  if (privateShown && !deepen.privateConfirmed) {
    return 'Give the private code confirmation above first.';
  }
  return undefined;
}

function Question(props: {
  readonly estimate: DeepenEstimate;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <ConfirmDialog
      title="Start this Deepen?"
      confirmLabel="Confirm and start"
      confirmVariant="primary"
      busy={props.busy}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    >
      <p>{confirmLineOf(props.estimate)}</p>
    </ConfirmDialog>
  );
}

/** The round limit and the coverage pass. */
function Controls(props: Pick<DeepenStart, 'choice' | 'setChoice'>): JSX.Element {
  const { choice, setChoice } = props;
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
          setChoice({ ...choice, maxRounds: Number(value) });
        }}
      />
      <Field
        kind="checkbox"
        id="deepen-coverage"
        label="Also read first-party files never read (coverage pass)"
        checked={choice.coveragePass}
        onChange={(checked) => {
          setChoice({ ...choice, coveragePass: checked });
        }}
      />
    </>
  );
}

/** RF-132, P8-79: the second confirmation of an uploaded or workbook project, from the start. */
function PrivateCode(props: {
  readonly deepen: DeepenStart;
  readonly code: DeepenPrivateCode;
}): JSX.Element {
  const { deepen, code } = props;
  const refused = deepen.error?.code === privateCode ? deepen.error : undefined;
  return (
    <PrivateCodeNotice
      projectName={code.projectName}
      workbooks={code.workbooks}
      providers={code.providers}
      confirmed={deepen.privateConfirmed}
      error={refused}
      onConfirm={deepen.setPrivateConfirmed}
      onSwitch={code.switchToOllama.run}
      switching={code.switchToOllama.switching}
      switchError={code.switchToOllama.error}
    />
  );
}

function Consent(props: {
  readonly cloud: ReturnType<typeof cloudRoles>;
  readonly deepen: DeepenStart;
  readonly code: DeepenPrivateCode;
  readonly refused: ReturnType<typeof useDeepenStart>['error'];
  readonly held: HeldConsentState;
}): JSX.Element {
  const { cloud, deepen, code, refused, held } = props;
  // RF-209, DEC-209 (P8-81): a consent of the project that holds shows as one line instead.
  if (held.consent !== undefined) return <ConsentLine consent={held.consent} held={held} />;
  return (
    <>
      {cloud.length === 0 ? null : (
        <CloudNotice
          roles={cloud}
          consent={deepen.consent}
          error={refused}
          reading={held.reading}
          onConsent={deepen.setConsent}
        />
      )}
      {code.shown ? <PrivateCode deepen={deepen} code={code} /> : null}
      {deepen.error === undefined ||
      refused !== undefined ||
      deepen.error.code === privateCode ? null : (
        <ErrorBanner error={deepen.error} />
      )}
    </>
  );
}

/** What makes the consent of the project be read again: the roles changed, or a box was refused. */
function heldKey(revision: number, deepen: DeepenStart): string {
  return `${String(revision)}:${deepen.error?.code ?? ''}`;
}

function Choices(props: { readonly runId: string; readonly projectId: string }): JSX.Element {
  const deepen = useDeepenStart(props.runId);
  // RF-132: the switch to Ollama changed the roles, so the estimate is read again.
  const [revision, setRevision] = useState(0);
  const load = useDeepenEstimate(props.runId, deepen.choice, revision);
  const [asking, setAsking] = useState(false);
  // A refusal closes the question; the reason shows on the page, and Start asks again.
  useEffect(() => {
    if (deepen.error !== undefined) setAsking(false);
  }, [deepen.error]);
  // RF-143, DEC-209 (P8-81): read again after a switch to Ollama or a refusal for a box.
  const held = useHeldConsent(props.projectId, 'understand', heldKey(revision, deepen));
  const asked = load.status === 'ready' && held.consent === undefined;
  const cloud = asked ? cloudRoles(load.estimate) : [];
  const code = useDeepenPrivateCode(props.projectId, cloud, deepen.privateAsked, () => {
    deepen.setPrivateConfirmed(false);
    setRevision((now) => now + 1);
  });
  // The refusal of the consent shows at the checkbox when the notice is there, else as a banner.
  const refused = cloud.length > 0 && deepen.error?.code === consentCode ? deepen.error : undefined;
  const reason = reasonOf(load, deepen, { consent: cloud.length > 0, privateShown: code.shown });
  return (
    <>
      <Controls choice={deepen.choice} setChoice={deepen.setChoice} />
      <DeepenEstimateView load={load} />
      <Consent {...{ cloud, deepen, code, refused, held }} />
      <Button
        variant="primary"
        {...(reason === undefined ? {} : { disabledReason: reason })}
        onClick={() => {
          setAsking(true);
        }}
      >
        Start Deepen
      </Button>
      {asking && load.status === 'ready' ? (
        <Question
          estimate={load.estimate}
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

function Panel({ runId, projectId, onClose }: PanelProps): JSX.Element {
  return (
    <section class="rst-p241-panel" aria-label="Deepen this run">
      <Choices runId={runId} projectId={projectId} />
      <Button onClick={onClose}>Not now</Button>
    </section>
  );
}

interface DeepenActionProps {
  readonly runId: string;
  /** RF-132, P8-79: the run's project, whose source kind decides the private-code confirmation. */
  readonly projectId: string;
  /** RF-646: Deepen is the recommended next action (answers given now will be used by it). */
  readonly recommended?: boolean;
  /** RF-1021: the panel with the estimate is open at once (the project page); nothing starts. */
  readonly open?: boolean;
  /**
   * RF-1021 (P8-84): the button alone, as the one primary button of "Your turn" or as a link under
   * it; the panel opens in its place.
   */
  readonly look?: 'primary' | 'link';
}

/** The closed action: the button, with the sentence that says what it does unless `look` is set. */
function Closed(props: DeepenActionProps & { readonly onOpen: () => void }): JSX.Element {
  const variant = props.look ?? (props.recommended === true ? 'primary' : 'secondary');
  const button = (
    <Button id="deepen-this-run" variant={variant} onClick={props.onOpen}>
      Deepen this run
    </Button>
  );
  if (props.look !== undefined) return button;
  return (
    <div class="rst-p241-action">
      <p>
        Send Rosetta back over what it did not confirm. Nothing starts until you see the estimate
        and confirm.
      </p>
      {button}
    </div>
  );
}

// RF-209
export function DeepenAction(props: DeepenActionProps): JSX.Element {
  const { runId, projectId } = props;
  const [open, setOpen] = useState(props.open === true);
  if (open) {
    return (
      <Panel
        runId={runId}
        projectId={projectId}
        onClose={() => {
          setOpen(false);
        }}
      />
    );
  }
  return (
    <Closed
      {...props}
      onOpen={() => {
        setOpen(true);
      }}
    />
  );
}
