import { useState } from 'preact/hooks';
import type { ApiClient, ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { createProject } from '../api/projects.js';
import { startRun, type RunStageChoice, type StartRequest } from '../api/runs.js';
import type { ApprovedAmount } from '../lib/journey-approval.js';
import { useApp } from '../app/app-context.js';
import { navigate } from '../app/router.js';
import { useStartConfirmation, type StartConfirmation } from './use-start-confirmation.js';

// RF-1001, RF-143, RF-132, RF-1108, DEC-117: what pressing Start does, in order. Another address than the
// project's is resolved to its own project and its start page. Otherwise a changed run cap or
// confirm threshold is saved with the project settings, and then the run is requested; a threshold
// above the cap is refused here, before any request, since the server would refuse the pair
// (RST-1005, RST-1006). An understand run whose likely cost is above the threshold is first asked
// about (RF-425): the question opens and nothing is saved or requested until it is confirmed. Each refusal is kept for the field it names (the address, the cap, the
// threshold, the areas, the consent) or, for anything else, for Start.

const NO_CONSENT = 'RST-1515';
const NO_PRIVATE_CONFIRMATION = 'RST-1521';
const UNKNOWN_AREA = 'RST-1307';

export interface ActionInputs {
  readonly project: Project;
  readonly stage: RunStageChoice;
  readonly areas: readonly string[];
  readonly consent: boolean;
  /** RF-132: the second confirmation was ticked (only ever true for an upload that needs it). */
  readonly privateConfirmed: boolean;
  /** RF-241: re-run with the answers of the open questions. */
  readonly withAnswers: boolean;
  readonly url: string;
  /** The confirm threshold saved in the project settings (RF-425). */
  readonly thresholdMicros: bigint;
  /** The run token cap saved in the project settings. */
  readonly capTokens: number;
  /** P5-07: every role is local, so the question compares tokens, not dollars. */
  readonly local: boolean;
  /** The likely cost of the priced roles, the figure the threshold is compared with (RF-425). */
  readonly likelyMicros: bigint | undefined;
  /** RF-429: the likely tokens of a local estimate, compared with the run token cap. */
  readonly likelyTokens: number | undefined;
  /** RF-430: the journey total the button names, recorded on the run as its approved amount. */
  readonly approvedAmount?: ApprovedAmount | undefined;
  readonly onConsentRefused: () => void;
}

interface Refusals {
  readonly url?: ApiFailure;
  readonly consent?: ApiFailure;
  readonly private?: ApiFailure;
  readonly areas?: ApiFailure;
  readonly start?: ApiFailure;
}

export interface StartActions {
  readonly busy: boolean;
  /** Counts the refusals shown, so the page can move focus to the first field that names one. */
  readonly attempts: number;
  readonly refusals: Refusals;
  /** RF-425: the question before an expensive run, and its two answers. */
  readonly confirmation: {
    readonly asking: boolean;
    readonly confirm: () => void;
    readonly cancel: () => void;
  };
  readonly submit: () => void;
  readonly resolve: () => void;
}

function requestOf(inputs: ActionInputs): StartRequest {
  if (inputs.stage === 'scan') return { stage: 'scan' };
  const request: StartRequest = {
    stage: 'understand',
    areas: inputs.areas,
    cloudConsent: inputs.consent,
  };
  const approved =
    inputs.approvedAmount === undefined
      ? request
      : { ...request, approvedAmount: inputs.approvedAmount };
  const confirmed = inputs.privateConfirmed
    ? { ...approved, privateCodeConfirmed: true }
    : approved;
  return inputs.withAnswers ? { ...confirmed, withAnswers: true } : confirmed;
}

interface Steps {
  readonly client: ApiClient;
  readonly inputs: ActionInputs;
  /** Keeps a refusal for its field and counts it; true, so the caller can stop. */
  readonly refuse: (refusals: Refusals) => boolean;
  readonly confirmation: StartConfirmation;
}

async function resolveUrl({ client, inputs, refuse }: Steps): Promise<boolean> {
  const result = await createProject(client, inputs.url.trim());
  if (!result.ok) return refuse({ url: result.error });
  navigate(`/projects/${encodeURIComponent(result.value.project.id)}`);
  return false;
}

function refusalOf(error: ApiFailure): Refusals {
  if (error.code === NO_CONSENT) return { consent: error };
  if (error.code === NO_PRIVATE_CONFIRMATION) return { private: error };
  return error.code === UNKNOWN_AREA ? { areas: error } : { start: error };
}

async function requestRun(steps: Steps): Promise<boolean> {
  const { client, inputs, refuse } = steps;
  const result = await startRun(client, inputs.project.id, requestOf(inputs));
  if (!result.ok) {
    if (result.error.code === NO_CONSENT) inputs.onConsentRefused();
    return refuse(refusalOf(result.error));
  }
  // RF-1019: a started step opens its live page by itself; a queued one says its place there.
  navigate(`/runs/${encodeURIComponent(result.value.id)}`);
  return false;
}

/**
 * Pressing Analyse: another address is resolved; a scan is requested; an understand run asks when
 * its likely cost is above the project's threshold (RF-425), and then is requested.
 */
async function press(steps: Steps): Promise<void> {
  const { inputs } = steps;
  if (inputs.url.trim() !== inputs.project.sourceUrl) {
    await resolveUrl(steps);
    return;
  }
  if (inputs.stage === 'understand' && steps.confirmation.ask(Number(inputs.thresholdMicros)))
    return;
  await requestRun(steps);
}

// RF-1001, RF-143, RF-1108
export function useStartActions(inputs: ActionInputs): StartActions {
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [refusals, setRefusals] = useState<Refusals>({});
  const confirmation = useStartConfirmation(inputs.likelyMicros, {
    likelyTokens: inputs.likelyTokens,
    capTokens: inputs.capTokens,
  });
  const steps: Steps = {
    ...{ client, inputs, confirmation },
    refuse: (next) => {
      setRefusals(next);
      setAttempts((current) => current + 1);
      return true;
    },
  };
  /** Runs one step with the page busy and the earlier refusals cleared. */
  const busyWith = async (step: () => Promise<unknown>): Promise<void> => {
    setRefusals({});
    setBusy(true);
    await step();
    setBusy(false);
  };
  return {
    ...{ busy, attempts, refusals },
    confirmation: {
      asking: confirmation.asking,
      confirm: () => {
        confirmation.accept();
        void busyWith(() => press(steps));
      },
      cancel: confirmation.decline,
    },
    submit: () => void busyWith(() => press(steps)),
    resolve: () => void busyWith(() => resolveUrl(steps)),
  };
}
