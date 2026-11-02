import { useState } from 'preact/hooks';
import type { RoleEstimate } from '../api/estimate-schemas.js';
import type { Project } from '../api/project-schemas.js';
import type { RunStageChoice } from '../api/runs.js';
import { capWarnings, type CapWarning } from '../lib/cap-warnings.js';
import { localLikelyTokens } from '../lib/start-confirmation.js';
import { cloudRoles, isLocalEstimate, pricedTotal } from '../lib/estimate-math.js';
import { administratorRunCapBinds, effectiveRunCapMicros, usesServerKeys } from '../lib/run-cap.js';
import { providerNames } from './provider-choices.js';
import { startGate, type StartGate } from './start-gate.js';
import { usePrivateCode, type PrivateCode } from './use-private-code.js';
import type { EstimateLoad } from './use-estimate.js';
import { useEstimateChoice, type EstimateChoice } from './use-estimate-choice.js';
import { useSpendLimits } from './use-spend-limits.js';
import { useAnsweredCount } from './use-answered-count.js';
import { useStartActions, type StartActions } from './use-start-actions.js';
import { useAutoScan, type AutoScan } from './use-auto-scan.js';
import { approvalText, approvedAmountOf, missingKeyProviders } from '../lib/journey-approval.js';

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
  readonly url: string;
  readonly setUrl: (url: string) => void;
  /** RF-436: the run cap saved in the project settings, where it is changed. */
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
  /** P5-07: the run token cap saved in the project settings. */
  readonly capTokens: number;
  /** P5-07: every role runs on a local model, so the page asks for a token cap, not dollars. */
  readonly local: boolean;
  /** The confirm threshold saved in the project settings. */
  readonly thresholdMicros: bigint;
  readonly consent: CloudConsent;
  /** RF-132: the second confirmation of an uploaded project whose roles use a cloud provider. */
  readonly privateCode: PrivateCode;
  readonly warnings: readonly CapWarning[];
  readonly gate: StartGate;
  readonly actions: StartActions;
  /** RF-160: the free scan that starts by itself when the project holds a source. */
  readonly scan: AutoScan;
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
  readonly local: boolean;
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
    runCapFromProject: !administratorRunCapBinds({ typed, ...serverRunCap }),
  });
  const local = estimate.status === 'ready' && isLocalEstimate(estimate.estimate);
  return { runCapMicros, serverRunCap, warnings, local };
}

/** RF-425: the likely cost of the priced roles, the figure the threshold is compared with. */
function likelyOf(estimate: EstimateLoad): bigint | undefined {
  return estimate.status === 'ready' ? pricedTotal(estimate.estimate, 'likely') : undefined;
}

/** RF-425, RF-429: the likely cost and, for a local estimate, the likely tokens, to confirm against the caps. */
function likelihoodOf(estimate: EstimateLoad) {
  const tokens = estimate.status === 'ready' ? localLikelyTokens(estimate.estimate) : undefined;
  return { likelyMicros: likelyOf(estimate), likelyTokens: tokens, local: tokens !== undefined };
}

/** RF-430, RF-431: the approved figure of the journey and the providers whose key is missing. */
function approvalOf(stage: RunStageChoice, estimate: EstimateLoad) {
  const likely = likelihoodOf(estimate);
  if (stage !== 'understand' || estimate.status !== 'ready') return { actions: likely, gate: {} };
  const approval = approvalText(estimate.estimate);
  const keyMissing = providerNames(missingKeyProviders(estimate.estimate));
  return {
    actions: { ...likely, approvedAmount: approvedAmountOf(estimate.estimate) },
    gate: { keyMissing, ...(approval === undefined ? {} : { approval }) },
  };
}

/** RF-436: the run cap, the confirm threshold and the token cap as the project settings hold them. */
function limitsOf(project: Project) {
  const { budget } = project.settings;
  return {
    capMicros: runCapOf(project),
    thresholdMicros: BigInt(budget.confirmAboveCostMicros),
    capTokens: budget.run.maxTokens,
  };
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
  const [url, setUrl] = useState(project.sourceUrl);
  const fields = limitsOf(project);
  const [checked, setChecked] = useState(false);
  const confirmed = useAreaConfirmations();
  const [refused, setRefused] = useState(false);
  const rerun = useRerun(loaded.id);
  const choice = useEstimateChoice(project.id);
  const { estimate } = choice;
  // RF-1022: the page asks for no stage; with no scan yet only a scan can start, else it is the journey.
  const stage: RunStageChoice = estimate.status === 'none' ? 'scan' : 'understand';
  const roles = stage === 'understand' ? consentRoles(estimate, refused) : [];
  const names = providerNames(roles.map((role) => role.provider));
  const runCaps = runCapsOf({ stage, estimate, limits: useSpendLimits(), typed: fields.capMicros });
  const privateCode = usePrivateCode(project, roles.length > 0, (saved) => {
    setProject(saved);
    setRefused(false);
    choice.reestimate();
  });
  const approval = approvalOf(stage, estimate);
  const actions = useStartActions({
    ...{ project, stage, url, ...fields, areas: choice.chosen, consent: checked },
    privateConfirmed: privateCode.confirmed,
    withAnswers: rerun.answered > 0 && rerun.checked,
    ...approval.actions,
    onConsentRefused: () => {
      setRefused(true);
    },
  });
  const libraryChosen = choice.areas.some((area) => area.checked && area.thirdParty);
  const scan = useAutoScan(project, estimate.status === 'none', choice.reestimate);
  const gate = startGate({
    ...{ stage, estimate, consentNeeded: names, consentGiven: checked },
    ...{ privateNeeded: privateCode.needed, privateGiven: privateCode.checked },
    chosenAreas: choice.chosen.length,
    oldMapUnconfirmed: isOutdated(estimate) && !confirmed.oldMap.confirmed,
    libraryUnconfirmed: libraryChosen && !confirmed.library.confirmed,
    ...noSourceOf(project),
    ...approval.gate,
  });
  return {
    ...{ project, choice, stage, url, setUrl, ...fields, ...runCaps },
    ...{ consent: { roles, names, checked, set: setChecked }, gate, actions, setProject, scan },
    ...{ privateCode, rerun },
    library: { chosen: libraryChosen, ...confirmed.library },
    oldMap: { outdated: isOutdated(estimate), ...confirmed.oldMap },
  };
}
