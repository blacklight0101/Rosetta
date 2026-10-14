import { useState } from 'preact/hooks';
import type { RoleEstimate } from '../api/estimate-schemas.js';
import type { Project } from '../api/project-schemas.js';
import type { RunStageChoice } from '../api/runs.js';
import { capWarnings, type CapWarning } from '../lib/cap-warnings.js';
import { cloudRoles } from '../lib/estimate-math.js';
import { dollarsToMicros, microsToDollars, RUN_COST_MAX_MICROS } from '../lib/usd.js';
import { providerNames } from './provider-choices.js';
import { startGate, type StartGate } from './start-gate.js';
import type { EstimateLoad } from './use-estimate.js';
import { useEstimateChoice, type EstimateChoice } from './use-estimate-choice.js';
import { useStartActions, type StartActions } from './use-start-actions.js';

// RF-1001, RF-143, DEC-108, DEC-117: the state of the start page: the stage, the address, the run
// cap and the confirm threshold beside it, the cloud consent, and what follows from them (the
// warnings, the gate on Start).

interface CloudConsent {
  /** The roles whose notice must be confirmed; empty when no code leaves this machine. */
  readonly roles: readonly RoleEstimate[];
  readonly names: string;
  readonly checked: boolean;
  readonly set: (checked: boolean) => void;
}

export interface StartForm {
  readonly project: Project;
  readonly choice: EstimateChoice;
  readonly stage: RunStageChoice;
  readonly setStage: (stage: RunStageChoice) => void;
  readonly url: string;
  readonly setUrl: (url: string) => void;
  readonly capText: string;
  readonly setCapText: (text: string) => void;
  readonly capMicros: bigint;
  readonly thresholdText: string;
  readonly setThresholdText: (text: string) => void;
  readonly consent: CloudConsent;
  readonly warnings: readonly CapWarning[];
  readonly gate: StartGate;
  readonly actions: StartActions;
}

/** RF-143: the cloud roles, or, once the server asked for the consent, the Ollama roles too. */
function consentRoles(estimate: EstimateLoad, refused: boolean): readonly RoleEstimate[] {
  if (estimate.status !== 'ready') return [];
  const cloud = cloudRoles(estimate.estimate);
  if (cloud.length > 0 || !refused) return cloud;
  return estimate.estimate.roles.filter((role) => role.kind === 'ollama');
}

function runCapOf(project: Project): bigint {
  return BigInt(project.settings.budget.run.maxCostMicros);
}

// RF-1001, RF-143, DEC-108
export function useStartForm(loaded: Project): StartForm {
  const [project, setProject] = useState(loaded);
  const [chosenStage, setStage] = useState<RunStageChoice>('understand');
  const [url, setUrl] = useState(project.sourceUrl);
  const [capText, setCapText] = useState(microsToDollars(runCapOf(project).toString()));
  const [thresholdText, setThresholdText] = useState(
    microsToDollars(String(project.settings.budget.confirmAboveCostMicros)),
  );
  const [checked, setChecked] = useState(false);
  const [refused, setRefused] = useState(false);
  const choice = useEstimateChoice(project.id);
  const { estimate } = choice;
  const stage = estimate.status === 'none' ? 'scan' : chosenStage;
  const roles = stage === 'understand' ? consentRoles(estimate, refused) : [];
  const names = providerNames(roles.map((role) => role.provider));
  const typedCap = dollarsToMicros(capText, RUN_COST_MAX_MICROS);
  const capMicros = typedCap === undefined ? runCapOf(project) : BigInt(typedCap);
  const warnings =
    stage === 'understand' && estimate.status === 'ready'
      ? capWarnings({
          ...{ estimate: estimate.estimate, runCapMicros: capMicros },
          limits: undefined,
        })
      : [];
  const actions = useStartActions({
    ...{ project, stage, url, capText, thresholdText, areas: choice.chosen, consent: checked },
    onSaved: setProject,
    onConsentRefused: () => {
      setRefused(true);
    },
  });
  const gate = startGate({
    ...{ stage, estimate, consentNeeded: names, consentGiven: checked },
    chosenAreas: choice.chosen.length,
  });
  return {
    ...{ project, choice, stage, setStage, url, setUrl, capText, setCapText, capMicros },
    ...{ thresholdText, setThresholdText },
    ...{ consent: { roles, names, checked, set: setChecked }, warnings, gate, actions },
  };
}
