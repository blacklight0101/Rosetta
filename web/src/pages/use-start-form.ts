import { useState } from 'preact/hooks';
import type { RoleEstimate } from '../api/estimate-schemas.js';
import type { Project } from '../api/project-schemas.js';
import type { RunStageChoice } from '../api/runs.js';
import { capWarnings, type CapWarning } from '../lib/cap-warnings.js';
import { localLikelyTokens } from '../lib/start-confirmation.js';
import { cloudRoles, pricedTotal } from '../lib/estimate-math.js';
import { effectiveRunCapMicros, usesServerKeys } from '../lib/run-cap.js';
import { dollarsToMicros, microsToDollars, RUN_COST_MAX_MICROS } from '../lib/usd.js';
import { providerNames } from './provider-choices.js';
import { startGate, type StartGate } from './start-gate.js';
import { usePrivateCode, type PrivateCode } from './use-private-code.js';
import type { EstimateLoad } from './use-estimate.js';
import { useEstimateChoice, type EstimateChoice } from './use-estimate-choice.js';
import { useSpendLimits } from './use-spend-limits.js';
import { useAnsweredCount } from './use-answered-count.js';
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

/** RF-113: the estimate says the code map comes from an older scanner. */
function isOutdated(estimate: EstimateLoad): boolean {
  return estimate.status === 'ready' && estimate.estimate.codeMap?.outdated === true;
}

export interface StartForm {
  /** RF-113: an outdated code map, and whether the user confirmed using it for an understand run. */
  readonly oldMap: {
    readonly outdated: boolean;
    readonly confirmed: boolean;
    readonly set: (confirmed: boolean) => void;
  };
  /** RF-1018: library areas are chosen, and whether the user confirmed reading them. */
  readonly library: {
    readonly chosen: boolean;
    readonly confirmed: boolean;
    readonly set: (confirmed: boolean) => void;
  };
  /** RF-241: the questions with an answer, and whether the run re-uses them. */
  readonly rerun: {
    readonly answered: number;
    readonly checked: boolean;
    readonly set: (checked: boolean) => void;
  };
  readonly project: Project;
  readonly choice: EstimateChoice;
  readonly stage: RunStageChoice;
  readonly setStage: (stage: RunStageChoice) => void;
  readonly url: string;
  readonly setUrl: (url: string) => void;
  readonly capText: string;
  readonly setCapText: (text: string) => void;
  /** The typed cap of the project, as the user sees it in the field. */
  readonly capMicros: bigint;
  /**
   * RF-1106, DEC-107: the cap a run starts with: the typed cap, or the administrator's run cap when
   * the run uses server keys and that cap is lower.
   */
  readonly runCapMicros: bigint;
  /** RF-1106: the administrator's run cap on server keys, and whether the estimate uses them. */
  readonly serverRunCap: {
    readonly administrator: bigint | undefined;
    readonly serverKeys: boolean;
  };
  readonly thresholdText: string;
  /** The threshold as typed, or the project's when it is not an amount. */
  readonly thresholdMicros: bigint;
  readonly setThresholdText: (text: string) => void;
  readonly consent: CloudConsent;
  /** RF-132: the second confirmation of an uploaded project whose roles use a cloud provider. */
  readonly privateCode: PrivateCode;
  readonly warnings: readonly CapWarning[];
  readonly gate: StartGate;
  readonly actions: StartActions;
  /** The project as the page now knows it (a zip was stored in it). */
  readonly setProject: (project: Project) => void;
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

/** An amount typed in dollars as micro-dollars; the project's own when it is not an amount. */
function micros(text: string, saved: number): bigint {
  const typed = dollarsToMicros(text, RUN_COST_MAX_MICROS);
  return typed === undefined ? BigInt(saved) : BigInt(typed);
}

/** DEC-108: the cap warnings of an understand estimate that has loaded. */
function warningsOf(input: {
  readonly stage: RunStageChoice;
  readonly estimate: EstimateLoad;
  readonly capMicros: bigint;
  readonly limits: ReturnType<typeof useSpendLimits>;
  readonly runCapFromProject: boolean;
}): readonly CapWarning[] {
  const { stage, estimate, capMicros, limits, runCapFromProject } = input;
  if (stage !== 'understand' || estimate.status !== 'ready') return [];
  return capWarnings({
    estimate: estimate.estimate,
    runCapMicros: capMicros,
    limits,
    runCapFromProject,
  });
}

/**
 * RF-1106, DEC-107: the run cap a run starts with (the administrator's run cap when the estimate uses
 * server keys and that cap is lower than the typed one), the figures the page names it with, and the
 * cap warnings computed against that cap.
 */
function runCapsOf(input: {
  readonly stage: RunStageChoice;
  readonly estimate: EstimateLoad;
  readonly limits: ReturnType<typeof useSpendLimits>;
  readonly typed: bigint;
}): {
  readonly runCapMicros: bigint;
  readonly serverRunCap: StartForm['serverRunCap'];
  readonly warnings: readonly CapWarning[];
} {
  const { stage, estimate, limits, typed } = input;
  const serverRunCap = {
    administrator: limits?.serverKeys.runCapMicros,
    serverKeys: estimate.status === 'ready' && usesServerKeys(estimate.estimate),
  };
  const runCapMicros = effectiveRunCapMicros({ typed, ...serverRunCap });
  const warnings = warningsOf({
    stage,
    estimate,
    capMicros: runCapMicros,
    limits,
    runCapFromProject: runCapMicros === typed,
  });
  return { runCapMicros, serverRunCap, warnings };
}

/** RF-425: the likely cost of the priced roles, the figure the threshold is compared with. */
function likelyOf(estimate: EstimateLoad): bigint | undefined {
  return estimate.status === 'ready' ? pricedTotal(estimate.estimate, 'likely') : undefined;
}

/** RF-425, RF-429: the likely cost and, for a local estimate, the likely tokens, to confirm against the caps. */
function likelihoodOf(estimate: EstimateLoad) {
  const tokens = estimate.status === 'ready' ? localLikelyTokens(estimate.estimate) : undefined;
  return { likelyMicros: likelyOf(estimate), likelyTokens: tokens };
}

/** DEC-117: the run cap and the confirm threshold as the user types them, from the project's own. */
function useLimitFields(project: Project) {
  const [capText, setCapText] = useState(microsToDollars(runCapOf(project).toString()));
  const [thresholdText, setThresholdText] = useState(
    microsToDollars(String(project.settings.budget.confirmAboveCostMicros)),
  );
  const { budget } = project.settings;
  const capMicros = micros(capText, budget.run.maxCostMicros);
  const thresholdMicros = micros(thresholdText, budget.confirmAboveCostMicros);
  return { capText, setCapText, thresholdText, setThresholdText, capMicros, thresholdMicros };
}

/** RF-113, RF-1018: whether the user confirmed the old code map and the library areas. */
function useAreaConfirmations() {
  const [oldMap, setOldMap] = useState(false);
  const [library, setLibrary] = useState(false);
  return {
    oldMap: { confirmed: oldMap, set: setOldMap },
    library: { confirmed: library, set: setLibrary },
  };
}

/** RF-241: the questions with an answer, and whether the run re-uses them. */
function useRerun(projectId: string): StartForm['rerun'] {
  const [checked, set] = useState(false);
  return { answered: useAnsweredCount(projectId), checked, set };
}

/** RF-128, RF-150: an upload project with no zip, or a workbook project with no batch, yet. */
function noSourceOf(project: Project): { noSource: boolean; noWorkbooks: boolean } {
  const empty = project.source === null;
  return {
    noSource: project.sourceKind === 'upload' && empty,
    noWorkbooks: project.sourceKind === 'workbook' && empty,
  };
}

// RF-1001, RF-143, DEC-108
export function useStartForm(loaded: Project): StartForm {
  const [project, setProject] = useState(loaded);
  const [chosenStage, setStage] = useState<RunStageChoice>('understand');
  const [url, setUrl] = useState(project.sourceUrl);
  const fields = useLimitFields(project);
  const [checked, setChecked] = useState(false);
  const confirmed = useAreaConfirmations();
  const [refused, setRefused] = useState(false);
  const rerun = useRerun(loaded.id);
  const choice = useEstimateChoice(project.id);
  const limits = useSpendLimits();
  const { estimate } = choice;
  const stage = estimate.status === 'none' ? 'scan' : chosenStage;
  const roles = stage === 'understand' ? consentRoles(estimate, refused) : [];
  const names = providerNames(roles.map((role) => role.provider));
  const runCaps = runCapsOf({ stage, estimate, limits, typed: fields.capMicros });
  const privateCode = usePrivateCode(project, roles.length > 0, (saved) => {
    setProject(saved);
    setRefused(false);
    choice.reestimate();
  });
  const actions = useStartActions({
    ...{ project, stage, url, ...fields, areas: choice.chosen, consent: checked },
    privateConfirmed: privateCode.confirmed,
    withAnswers: rerun.answered > 0 && rerun.checked,
    ...likelihoodOf(estimate),
    onSaved: setProject,
    onConsentRefused: () => {
      setRefused(true);
    },
  });
  const libraryChosen = choice.areas.some((area) => area.checked && area.thirdParty);
  const gate = startGate({
    ...{ stage, estimate, consentNeeded: names, consentGiven: checked },
    privateNeeded: privateCode.needed,
    privateGiven: privateCode.checked,
    chosenAreas: choice.chosen.length,
    oldMapUnconfirmed: isOutdated(estimate) && !confirmed.oldMap.confirmed,
    libraryUnconfirmed: libraryChosen && !confirmed.library.confirmed,
    ...noSourceOf(project),
  });
  return {
    ...{ project, choice, stage, setStage, url, setUrl, ...fields, ...runCaps },
    ...{ consent: { roles, names, checked, set: setChecked }, gate, actions, setProject },
    privateCode,
    rerun,
    library: { chosen: libraryChosen, ...confirmed.library },
    oldMap: { outdated: isOutdated(estimate), ...confirmed.oldMap },
  };
}
