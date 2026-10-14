import { useState } from 'preact/hooks';
import type { ApiClient, ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { createProject, getProject, saveProjectSettings } from '../api/projects.js';
import { problemFor } from '../api/problems.js';
import { cancelRun, startRun, type RunStageChoice, type StartRequest } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { navigate } from '../app/router.js';
import { dollarsToMicros, RUN_COST_MAX_MICROS } from '../lib/usd.js';
import type { RunNoticeState } from './RunNotice.js';

// RF-1001, RF-143, RF-1108, DEC-117: what pressing Start does, in order. Another address than the
// project's is resolved to its own project and its start page. Otherwise a changed run cap or
// confirm threshold is saved with the project settings, and then the run is requested; a threshold
// above the cap is refused here, before any request, since the server would refuse the pair
// (RST-1005, RST-1006). Each refusal is kept for the field it names (the address, the cap, the
// threshold, the areas, the consent) or, for anything else, for Start.

const RUN_CAP_PATH = 'budget.run.maxCostMicros';
const THRESHOLD_PATH = 'budget.confirmAboveCostMicros';
const NO_CONSENT = 'RST-1515';
const UNKNOWN_AREA = 'RST-1307';
const notAnAmount: FieldProblem = { message: 'Enter an amount in dollars, for example 2.00.' };
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
  readonly url: string;
  readonly capText: string;
  readonly thresholdText: string;
  /** Told the project with the settings the page just saved. */
  readonly onSaved: (project: Project) => void;
  readonly onConsentRefused: () => void;
}

interface Refusals {
  readonly url?: ApiFailure;
  readonly cap?: FieldProblem;
  readonly threshold?: FieldProblem;
  readonly consent?: ApiFailure;
  readonly areas?: ApiFailure;
  readonly start?: ApiFailure;
}

export interface StartActions {
  readonly busy: boolean;
  /** Counts the refusals shown, so the page can move focus to the first field that names one. */
  readonly attempts: number;
  readonly refusals: Refusals;
  readonly notice: RunNoticeState | undefined;
  readonly submit: () => void;
  readonly resolve: () => void;
  readonly cancel: () => void;
}

function requestOf(inputs: ActionInputs): StartRequest {
  if (inputs.stage === 'scan') return { stage: 'scan' };
  return { stage: 'understand', areas: inputs.areas, cloudConsent: inputs.consent };
}

/** The run cap and the confirm threshold the page asks for, in micro-dollars. */
interface Limits {
  readonly cap: number;
  readonly threshold: number;
}

function settingsWithLimits(project: Project, limits: Limits): Project['settings'] {
  const { budget } = project.settings;
  const run = { ...budget.run, maxCostMicros: limits.cap };
  return {
    ...project.settings,
    budget: { ...budget, run, confirmAboveCostMicros: limits.threshold },
  };
}

/** The limits typed on the page, or the refusal of the field that is wrong (DEC-117). */
function limitsOf(
  inputs: ActionInputs,
): { readonly limits: Limits } | { readonly refusal: Refusals } {
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
    limits.cap === budget.run.maxCostMicros && limits.threshold === budget.confirmAboveCostMicros
  );
}

/** The refusal of a save: next to the cap or the threshold when it names one, else at Start. */
function saveRefusal(error: ApiFailure): Refusals {
  const cap = problemFor(error, RUN_CAP_PATH);
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
}

async function resolveUrl({ client, inputs, refuse }: Steps): Promise<boolean> {
  const result = await createProject(client, inputs.url.trim());
  if (!result.ok) return refuse({ url: result.error });
  navigate(`/projects/${encodeURIComponent(result.value.project.id)}/start`);
  return false;
}

/** Saves a changed run cap or threshold with the settings; true when the run must not start. */
async function saveLimits({ client, inputs, refuse }: Steps): Promise<boolean> {
  const typed = limitsOf(inputs);
  if ('refusal' in typed) return refuse(typed.refusal);
  const { limits } = typed;
  if (unchanged(inputs.project, limits)) return false;
  // A save replaces the whole document, so it starts from the settings as they are now: what
  // another session changed since this page opened stays (only the limits are ours to change).
  const read = await getProject(client, inputs.project.id, new AbortController().signal);
  if (!read.ok) return refuse({ start: read.error });
  const project = read.value;
  const saved = await saveProjectSettings(client, project.id, settingsWithLimits(project, limits));
  if (saved.ok) {
    inputs.onSaved(saved.value);
    return false;
  }
  return refuse(saveRefusal(saved.error));
}

function refusalOf(error: ApiFailure): Refusals {
  if (error.code === NO_CONSENT) return { consent: error };
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

/** Pressing Start: another address is resolved; else the limits are saved, then the run requested. */
async function press(steps: Steps): Promise<void> {
  const { inputs } = steps;
  if (inputs.url.trim() !== inputs.project.sourceUrl) await resolveUrl(steps);
  else if (inputs.stage !== 'understand' || !(await saveLimits(steps))) await requestRun(steps);
}

// RF-1001, RF-143, RF-1108
export function useStartActions(inputs: ActionInputs): StartActions {
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [refusals, setRefusals] = useState<Refusals>({});
  const [notice, setNotice] = useState<RunNoticeState | undefined>();
  const steps: Steps = {
    ...{ client, inputs, show: setNotice },
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
    submit: () => void busyWith(() => press(steps)),
    resolve: () => void busyWith(() => resolveUrl(steps)),
    cancel: () => void cancel(),
  };
}
