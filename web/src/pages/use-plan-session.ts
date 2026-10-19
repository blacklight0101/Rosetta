import { useCallback, useEffect, useState } from 'preact/hooks';
import type { BriefView, PlanEstimate, PlanOptions } from '../api/plan-schemas.js';
import type { Project } from '../api/project-schemas.js';
import { chooseStyle } from '../lib/plan-setup/choices.js';
import { isAnswered, type Draft } from '../lib/plan-setup/draft.js';
import {
  blockersOf,
  needsConsent,
  plannerOfProject,
  type Blocker,
} from '../lib/plan-setup/estimate.js';
import { usePlanEstimate, type EstimateLoad } from './use-plan-estimate.js';
import { usePlanOptions, type OptionsLoad } from './use-plan-options.js';
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
  readonly consent: boolean;
  readonly setConsent: (consent: boolean) => void;
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

function shownChoice(draft: Draft, options: PlanOptions | undefined): Draft | undefined {
  if (options === undefined || isAnswered(draft, 'architecture')) return undefined;
  return chooseStyle(draft, options, options.architecture.recommended);
}

function stepReasonOf(finished: boolean, cloud: boolean, consent: boolean): string | undefined {
  if (!finished) {
    return 'Finish the steps first: answer what you know or use the defaults for the rest.';
  }
  return cloud && !consent ? 'Give the consent above first.' : undefined;
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
  const { provider, kind } = plannerOfProject(project);
  const cloud = needsConsent(kind);
  const options = usePlanOptions({
    projectId,
    wanted: useOptionsWanted(setup.step),
    allowed: !cloud || consent,
    consent: cloud && consent,
    sourceRunId,
  });
  const proposed = options.load.status === 'ready' ? options.load.options : undefined;
  const accepted = setup.step === 'architecture' ? shownChoice(setup.draft, proposed) : undefined;
  return {
    ...setup,
    estimate: estimate.load,
    planner,
    plannerProvider: provider,
    blockers: planner === undefined ? [] : blockersOf(planner),
    cloud,
    consent: cloud && consent,
    setConsent,
    options: options.load,
    askAgain: options.askAgain,
    stepReason: stepReasonOf(setup.finished, cloud, consent),
    savedVersion,
    save: () => {
      setup.saveAndContinue(accepted);
    },
  };
}
