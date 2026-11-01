import { useState } from 'preact/hooks';
import type { ApiClient, ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { createProject, getProject, saveProjectSettings } from '../api/projects.js';
import { problemFor } from '../api/problems.js';
import { cancelRun, startRun, type RunStageChoice, type StartRequest } from '../api/runs.js';
import type { ApprovedAmount } from '../lib/journey-approval.js';
import { useApp } from '../app/app-context.js';
import { navigate } from '../app/router.js';
import { tokensOf } from '../lib/token-cap.js';
import { dollarsToMicros, RUN_COST_MAX_MICROS } from '../lib/usd.js';
import type { RunNoticeState } from './RunNotice.js';
import { useQueuePosition } from './use-queue-position.js';
import { useStartConfirmation, type StartConfirmation } from './use-start-confirmation.js';

// RF-1001, RF-143, RF-132, RF-1108, DEC-117: what pressing Start does, in order. Another address than the
// project's is resolved to its own project and its start page. Otherwise a changed run cap or
// confirm threshold is saved with the project settings, and then the run is requested; a threshold
// above the cap is refused here, before any request, since the server would refuse the pair
// (RST-1005, RST-1006). An understand run whose likely cost is above the threshold is first asked
// about (RF-425): the question opens and nothing is saved or requested until it is confirmed. Each refusal is kept for the field it names (the address, the cap, the
// threshold, the areas, the consent) or, for anything else, for Start.

const RUN_CAP_PATH = 'budget.run.maxCostMicros';
const THRESHOLD_PATH = 'budget.confirmAboveCostMicros';
const NO_CONSENT = 'RST-1515';
const NO_PRIVATE_CONFIRMATION = 'RST-1521';
const UNKNOWN_AREA = 'RST-1307';
const TOKENS_PATH = 'budget.run.maxTokens';
const notAnAmount: FieldProblem = { message: 'Enter an amount in dollars, for example 2.00.' };
const notACount: FieldProblem = {
  message: 'Enter a whole number of tokens, for example 2000000.',
};
const aboveCap: FieldProblem = {
  message: 'The threshold must not be above the run cap. Lower it, or raise the run cap.',
};

/** A refusal the page itself makes, or one the server made for a field. */
interface FieldProblem {
  readonly code?: string;
  readonly message: string;
}

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
  readonly capText: string;
  readonly thresholdText: string;
  /** P5-07: every role is local, so the run token cap is the one limit on the page; dollars stay as saved. */
  readonly local: boolean;
  readonly tokensText: string;
  /** The likely cost of the priced roles, the figure the threshold is compared with (RF-425). */
  readonly likelyMicros: bigint | undefined;
  /** RF-429: the likely tokens of a local estimate, compared with the run token cap. */
  readonly likelyTokens: number | undefined;
  /** RF-430: the journey total the button names, recorded on the run as its approved amount. */
  readonly approvedAmount?: ApprovedAmount | undefined;
  /** Told the project with the settings the page just saved. */
  readonly onSaved: (project: Project) => void;
  readonly onConsentRefused: () => void;
}

interface Refusals {
  readonly url?: ApiFailure;
  readonly cap?: FieldProblem;
  readonly threshold?: FieldProblem;
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
  readonly notice: RunNoticeState | undefined;
  /** RF-425: the question before an expensive run, and its two answers. */
  readonly confirmation: {
    readonly asking: boolean;
    readonly confirm: () => void;
    readonly cancel: () => void;
  };
  readonly submit: () => void;
  readonly resolve: () => void;
  readonly cancel: () => void;
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

/** What the page asks to save; a limit left out is not the page's to change (P5-07: a local run has no dollar fields). */
interface Limits {
  readonly cap?: number;
  readonly threshold?: number;
  readonly tokens?: number;
}

function settingsWithLimits(project: Project, limits: Limits): Project['settings'] {
  const { budget } = project.settings;
  const run = {
    ...budget.run,
    ...(limits.cap === undefined ? {} : { maxCostMicros: limits.cap }),
    ...(limits.tokens === undefined ? {} : { maxTokens: limits.tokens }),
  };
  const confirmAboveCostMicros = limits.threshold ?? budget.confirmAboveCostMicros;
  return { ...project.settings, budget: { ...budget, run, confirmAboveCostMicros } };
}

type Typed = { readonly limits: Limits } | { readonly refusal: Refusals };

/** P5-07: the token cap of a local run. */
function tokenLimitsOf(inputs: ActionInputs): Typed {
  const tokens = tokensOf(inputs.tokensText);
  return tokens === undefined ? { refusal: { cap: notACount } } : { limits: { tokens } };
}

/** The limits typed on the page, or the refusal of the field that is wrong (DEC-117). */
function limitsOf(inputs: ActionInputs): Typed {
  if (inputs.local) return tokenLimitsOf(inputs);
  const cap = dollarsToMicros(inputs.capText, RUN_COST_MAX_MICROS);
  if (cap === undefined) return { refusal: { cap: notAnAmount } };
  const threshold = dollarsToMicros(inputs.thresholdText, RUN_COST_MAX_MICROS);
  if (threshold === undefined) return { refusal: { threshold: notAnAmount } };
  if (BigInt(threshold) > BigInt(cap)) return { refusal: { threshold: aboveCap } };
  return { limits: { cap: Number(cap), threshold: Number(threshold) } };
}

function unchanged(project: Project, limits: Limits): boolean {
  const { budget } = project.settings;
  return (
    (limits.cap ?? budget.run.maxCostMicros) === budget.run.maxCostMicros &&
    (limits.threshold ?? budget.confirmAboveCostMicros) === budget.confirmAboveCostMicros &&
    (limits.tokens ?? budget.run.maxTokens) === budget.run.maxTokens
  );
}

/** The refusal of a save: next to the cap or the threshold when it names one, else at Start. */
function saveRefusal(error: ApiFailure): Refusals {
  const cap = problemFor(error, RUN_CAP_PATH) ?? problemFor(error, TOKENS_PATH);
  const threshold = problemFor(error, THRESHOLD_PATH);
  if (cap === undefined && threshold === undefined) return { start: error };
  return {
    ...(cap === undefined ? {} : { cap }),
    ...(threshold === undefined ? {} : { threshold }),
  };
}

interface Steps {
  readonly client: ApiClient;
  readonly inputs: ActionInputs;
  /** Keeps a refusal for its field and counts it; true, so the caller can stop. */
  readonly refuse: (refusals: Refusals) => boolean;
  readonly show: (notice: RunNoticeState) => void;
  readonly confirmation: StartConfirmation;
}

async function resolveUrl({ client, inputs, refuse }: Steps): Promise<boolean> {
  const result = await createProject(client, inputs.url.trim());
  if (!result.ok) return refuse({ url: result.error });
  navigate(`/projects/${encodeURIComponent(result.value.project.id)}/start`);
  return false;
}

/** Saves a changed run cap or threshold with the settings; true when the run must not start. */
async function saveLimits({ client, inputs, refuse }: Steps, limits: Limits): Promise<boolean> {
  if (unchanged(inputs.project, limits)) return false;
  // A save replaces the whole document, so it starts from the settings as they are now: what
  // another session changed since this page opened stays (only the limits are ours to change).
  const read = await getProject(client, inputs.project.id, new AbortController().signal);
  if (!read.ok) return refuse({ start: read.error });
  const project = read.value;
  const saved = await saveProjectSettings(client, project, settingsWithLimits(project, limits));
  if (saved.ok) {
    inputs.onSaved(saved.value);
    return false;
  }
  return refuse(saveRefusal(saved.error));
}

function refusalOf(error: ApiFailure): Refusals {
  if (error.code === NO_CONSENT) return { consent: error };
  if (error.code === NO_PRIVATE_CONFIRMATION) return { private: error };
  return error.code === UNKNOWN_AREA ? { areas: error } : { start: error };
}

async function requestRun(steps: Steps): Promise<boolean> {
  const { client, inputs, refuse, show } = steps;
  const result = await startRun(client, inputs.project.id, requestOf(inputs));
  if (!result.ok) {
    if (result.error.code === NO_CONSENT) inputs.onConsentRefused();
    return refuse(refusalOf(result.error));
  }
  const { id, position, stage } = result.value;
  show(
    position === null
      ? { kind: 'started', stage, runId: id }
      : { kind: 'queued', runId: id, position, cancelError: undefined },
  );
  return false;
}

/**
 * Pressing Start: another address is resolved; a scan is requested; an understand run first checks
 * the limits, asks when its likely cost is above the threshold (RF-425), saves a changed cap or
 * threshold, and then is requested.
 */
async function press(steps: Steps): Promise<void> {
  const { inputs } = steps;
  if (inputs.url.trim() !== inputs.project.sourceUrl) {
    await resolveUrl(steps);
    return;
  }
  if (inputs.stage !== 'understand') {
    await requestRun(steps);
    return;
  }
  const typed = limitsOf(inputs);
  if ('refusal' in typed) {
    steps.refuse(typed.refusal);
    return;
  }
  const threshold = typed.limits.threshold ?? inputs.project.settings.budget.confirmAboveCostMicros;
  if (steps.confirmation.ask(threshold)) return;
  if (!(await saveLimits(steps, typed.limits))) await requestRun(steps);
}

// RF-1001, RF-143, RF-1108
export function useStartActions(inputs: ActionInputs): StartActions {
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [refusals, setRefusals] = useState<Refusals>({});
  const [notice, setNotice] = useState<RunNoticeState | undefined>();
  useQueuePosition(notice, setNotice);
  const savedTokens = inputs.project.settings.budget.run.maxTokens;
  const confirmation = useStartConfirmation(inputs.likelyMicros, {
    likelyTokens: inputs.likelyTokens,
    capTokens: inputs.local ? (tokensOf(inputs.tokensText) ?? savedTokens) : savedTokens,
  });
  const steps: Steps = {
    ...{ client, inputs, confirmation, show: setNotice },
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
  const cancel = async (): Promise<void> => {
    if (notice?.kind !== 'queued') return;
    setBusy(true);
    const result = await cancelRun(client, notice.runId);
    setBusy(false);
    setNotice(result.ok ? { kind: 'cancelled' } : { ...notice, cancelError: result.error });
  };
  return {
    ...{ busy, attempts, refusals, notice },
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
    cancel: () => void cancel(),
  };
}
