import { useCallback, useEffect, useState } from 'preact/hooks';
import type { BriefView, PlanEstimate } from '../api/plan-schemas.js';
import type { Project } from '../api/project-schemas.js';
import { chooseStyle } from '../lib/plan-setup/choices.js';
import { isAnswered, shownMethod, withAnswered, type Draft } from '../lib/plan-setup/draft.js';
import {
  blockersOf,
  needsConsent,
  plannerOfProject,
  type Blocker,
} from '../lib/plan-setup/estimate.js';
import { usePlanEstimate, type EstimateLoad } from './use-plan-estimate.js';
import { usePlanOptions, type OptionsLoad } from './use-plan-options.js';
import { usePrivateCode, type PrivateCode } from './use-private-code.js';
import { usePlanSetup, type PlanSetupActions, type PlanSetupState } from './use-plan-setup.js';

// RF-605, RF-608, RF-613, RF-143: everything the Plan setup page keeps together: the answers, the
// estimate, the options of the planner and the consent. The options are asked once a step that
// shows them has been opened, and for a cloud planner only after the consent.

export interface PlanSession extends PlanSetupState, PlanSetupActions {
  readonly estimate: EstimateLoad;
  readonly planner: PlanEstimate | undefined;
  /** The provider the planner role uses, from the project's settings. */
  readonly plannerProvider: string;
  readonly blockers: readonly Blocker[];
  /** The planner would send code off this machine. */
  readonly cloud: boolean;
  /** The options wait for a confirmation that is not given yet. */
  readonly waitingForConsent: boolean;
  readonly consent: boolean;
  readonly setConsent: (consent: boolean) => void;
  /** RF-132: the second confirmation of an uploaded project whose planner uses a cloud provider. */
  readonly privateCode: PrivateCode;
  /** The project as the page has it: the settings after a switch to Ollama. */
  readonly project: Project;
  readonly options: OptionsLoad;
  readonly askAgain: () => void;
  /** Why the package cannot be written for a reason of the steps or the consent. */
  readonly stepReason: string | undefined;
  /** Saves the draft, taking the architecture the page showed as chosen when it was not touched. */
  readonly save: () => void;
  /** RF-615: how many times the brief was saved on this page, so the journey reads again. */
  readonly savedVersion: number;
}

const OPTION_STEPS: readonly string[] = ['architecture', 'stack'];

function shownChoice(setup: PlanSetupState, load: OptionsLoad): Draft | undefined {
  const { draft } = setup;
  if (setup.step === 'method') {
    const shown = shownMethod(draft);
    return shown === draft ? undefined : withAnswered(shown, ['buildMethod']);
  }
  const options = load.status === 'ready' ? load.options : undefined;
  if (setup.step !== 'architecture' || options === undefined) return undefined;
  if (isAnswered(draft, 'architecture')) return undefined;
  return chooseStyle(draft, options, options.architecture.recommended);
}

function stepReasonOf(
  finished: boolean,
  consent: { readonly cloud: boolean; readonly given: boolean; readonly private: PrivateCode },
): string | undefined {
  if (!finished) {
    return 'Finish the steps first: answer what you know or use the defaults for the rest.';
  }
  if (consent.cloud && !consent.given) return 'Give the consent above first.';
  if (consent.private.needed && !consent.private.checked) {
    return 'Give the private code confirmation above first.';
  }
  return undefined;
}

/** Latches once a step that shows the options of the planner has been opened. */
function useOptionsWanted(step: string): boolean {
  const [wanted, setWanted] = useState(false);
  const optionStep = OPTION_STEPS.includes(step);
  useEffect(() => {
    if (optionStep) setWanted(true);
  }, [optionStep]);
  return wanted;
}

/** The project as the page has it, its planner, and the confirmations the planner needs (RF-132). */
function usePlanner(project: Project, onSwitched: () => void) {
  const [current, setProject] = useState(project);
  const { provider, kind } = plannerOfProject(current);
  const cloud = needsConsent(kind);
  const privateCode = usePrivateCode(current, cloud, (saved) => {
    setProject(saved);
    onSwitched();
  });
  return { current, provider, cloud, privateCode };
}

// RF-605
export function usePlanSession(
  request: { readonly projectId: string; readonly sourceRunId: string | undefined },
  view: BriefView,
  project: Project,
): PlanSession {
  const { projectId, sourceRunId } = request;
  const [saved, setSaved] = useState(view.saved);
  const [savedVersion, setSavedVersion] = useState(0);
  const estimate = usePlanEstimate(request, saved);
  const [consent, setConsent] = useState(false);
  const { reload } = estimate;
  const onSaved = useCallback(() => {
    setSaved(true);
    setSavedVersion((count) => count + 1);
    reload();
  }, [reload]);
  const setup = usePlanSetup(projectId, view, onSaved);
  const planner = estimate.load.status === 'ready' ? estimate.load.estimate : undefined;
  const { current, provider, cloud, privateCode } = usePlanner(project, reload);
  const waiting = cloud && !(consent && (!privateCode.needed || privateCode.checked));
  const options = usePlanOptions({
    projectId,
    wanted: useOptionsWanted(setup.step),
    allowed: !waiting,
    consent: cloud && consent,
    privateConfirmed: privateCode.confirmed,
    sourceRunId,
  });
  return {
    ...setup,
    estimate: estimate.load,
    planner,
    plannerProvider: provider,
    blockers: planner === undefined ? [] : blockersOf(planner),
    cloud,
    waitingForConsent: waiting,
    consent: cloud && consent,
    setConsent,
    privateCode,
    project: current,
    options: options.load,
    askAgain: options.askAgain,
    stepReason: stepReasonOf(setup.finished, { cloud, given: consent, private: privateCode }),
    savedVersion,
    save: () => {
      setup.saveAndContinue(shownChoice(setup, options.load));
    },
  };
}
