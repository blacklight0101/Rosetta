import { useState } from 'preact/hooks';
import type { ApiClient, ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { createProject, getProject, saveProjectSettings } from '../api/projects.js';
import { problemFor } from '../api/problems.js';
import { cancelRun, startRun, type RunStageChoice, type StartRequest } from '../api/runs.js';
import { useApp } from '../app/app-context.js';
import { navigate } from '../app/router.js';
import { dollarsToMicros } from '../lib/usd.js';
import type { RunNoticeState } from './RunNotice.js';

// RF-1001, RF-143, RF-1108: what pressing Start does, in order. Another address than the project's
// is resolved to its own project and its start page. Otherwise a changed run cap is saved with the
// project settings, and then the run is requested. Each refusal is kept for the field it names (the
// address, the cap, the areas, the consent) or, for anything else, for Start.

const RUN_CAP_PATH = 'budget.run.maxCostMicros';
const NO_CONSENT = 'RST-1515';
const UNKNOWN_AREA = 'RST-1307';
const notAnAmount: FieldProblem = { message: 'Enter an amount in dollars, for example 2.00.' };

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
  /** Told the project with the settings the page just saved. */
  readonly onSaved: (project: Project) => void;
  readonly onConsentRefused: () => void;
}

interface Refusals {
  readonly url?: ApiFailure;
  readonly cap?: FieldProblem;
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

function settingsWithCap(project: Project, micros: string): Project['settings'] {
  const { budget } = project.settings;
  const run = { ...budget.run, maxCostMicros: Number(micros) };
  return { ...project.settings, budget: { ...budget, run } };
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

/** Saves a changed run cap with the project settings; true when the run must not start. */
async function saveCap({ client, inputs, refuse }: Steps): Promise<boolean> {
  const micros = dollarsToMicros(inputs.capText);
  if (micros === undefined) return refuse({ cap: notAnAmount });
  if (Number(micros) === inputs.project.settings.budget.run.maxCostMicros) return false;
  // A save replaces the whole document, so it starts from the settings as they are now: what
  // another session changed since this page opened stays (only the cap is ours to change).
  const read = await getProject(client, inputs.project.id, new AbortController().signal);
  if (!read.ok) return refuse({ start: read.error });
  const project = read.value;
  const saved = await saveProjectSettings(client, project.id, settingsWithCap(project, micros));
  if (saved.ok) {
    inputs.onSaved(saved.value);
    return false;
  }
  const cap = problemFor(saved.error, RUN_CAP_PATH);
  return refuse(cap === undefined ? { start: saved.error } : { cap });
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
      ? { kind: 'started', stage }
      : { kind: 'queued', runId: id, position, cancelError: undefined },
  );
  return false;
}

/** Pressing Start: another address is resolved; otherwise the cap is saved, then the run requested. */
async function press(steps: Steps): Promise<void> {
  const { inputs } = steps;
  if (inputs.url.trim() !== inputs.project.sourceUrl) await resolveUrl(steps);
  else if (inputs.stage !== 'understand' || !(await saveCap(steps))) await requestRun(steps);
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
