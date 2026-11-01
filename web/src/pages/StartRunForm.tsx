import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import type { Project } from '../api/project-schemas.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { CloudNotice } from './CloudNotice.js';
import { PrivateCodeNotice } from './PrivateCodeNotice.js';
import { EstimateSection } from './EstimateSection.js';
import { RepositorySection } from './RepositorySection.js';
import { UploadSourceSection } from './UploadSourceSection.js';
import { WorkbookSourceSection } from './WorkbookSourceSection.js';
import { localLikelyTokens } from '../lib/start-confirmation.js';
import { StartConfirmDialog } from './StartConfirmDialog.js';
import { StaleCodeMapNotice } from './StaleCodeMapNotice.js';
import { StageAreasSection } from './StageAreasSection.js';
import { ScanSection } from './ScanSection.js';
import { SummaryBar } from './SummaryBar.js';
import { useStartForm, type StartForm } from './use-start-form.js';

// RF-1001, RF-143, RF-132, RF-425, RF-1108, RF-1018, DEC-108, design-system.md section 14 (Start run): the
// page body. Repository, stage and areas, the estimate with the run cap, the cloud notice with its
// consent, the queue notice, and the summary bar with Start (SummaryBar.tsx). A refusal shows next to the field it names and focus moves to
// the first of them; one that names no field shows above Start.

function Columns({ form }: { readonly form: StartForm }): JSX.Element {
  const { choice, stage, actions, warnings } = form;
  const { estimate } = choice;
  return (
    <div class="rst-start__columns">
      <StageAreasSection
        stage={stage}
        understandAvailable={estimate.status !== 'none'}
        areas={choice.areas}
        areasError={actions.refusals.areas}
        onStage={form.setStage}
        onArea={choice.toggle}
        onChoose={choice.choose}
        libraryConfirmed={form.library.confirmed}
        onLibraryConfirm={form.library.set}
        rerun={{
          answered: form.rerun.answered,
          checked: form.rerun.checked,
          onChange: form.rerun.set,
        }}
      />
      <EstimateSection
        scanOnly={stage === 'scan'}
        sourceKind={form.project.sourceKind}
        estimate={estimate}
        warnings={warnings}
        capsHref={`/projects/${form.project.id}/settings#caps`}
        onRetry={choice.reestimate}
        cap={{
          text: form.capText,
          capMicros: form.capMicros,
          serverRunCap: form.serverRunCap,
          capTokens: form.capTokens,
          tokens: { text: form.tokensText, onInput: form.setTokensText },
          error: actions.refusals.cap,
          onInput: form.setCapText,
          threshold: {
            text: form.thresholdText,
            error: actions.refusals.threshold,
            onInput: form.setThresholdText,
          },
        }}
      />
    </div>
  );
}

/** RF-425: the question before an understand run whose likely cost is above the threshold. */
function Confirmation({ form }: { readonly form: StartForm }): JSX.Element | null {
  const { actions, choice } = form;
  const { estimate } = choice;
  if (!actions.confirmation.asking || estimate.status !== 'ready') return null;
  const likelyTokens = localLikelyTokens(estimate.estimate);
  const capTokens = form.capTokens;
  const over = likelyTokens !== undefined && likelyTokens > capTokens;
  return (
    <StartConfirmDialog
      overTokenCap={over ? { likelyTokens, capTokens } : undefined}
      estimate={estimate.estimate}
      thresholdMicros={form.thresholdMicros}
      capMicros={form.runCapMicros}
      busy={actions.busy}
      onConfirm={actions.confirmation.confirm}
      onCancel={actions.confirmation.cancel}
    />
  );
}

/** RF-132: the second notice of an uploaded project whose roles send code to a cloud provider. */
function PrivateCode({ form }: { readonly form: StartForm }): JSX.Element | null {
  const { privateCode, consent, actions, project } = form;
  if (!privateCode.needed) return null;
  return (
    <PrivateCodeNotice
      projectName={project.name}
      workbooks={privateCode.workbooks}
      providers={consent.names}
      confirmed={privateCode.checked}
      error={actions.refusals.private}
      onConfirm={privateCode.set}
      onSwitch={privateCode.switchToOllama.run}
      switching={privateCode.switchToOllama.switching}
      switchError={privateCode.switchToOllama.error}
    />
  );
}

const leads = {
  github:
    'Paste a public GitHub repository URL. Rosetta pins it to a commit and downloads that snapshot once.',
  upload: 'This project holds a zip of your code. Rosetta reads that copy, never your computer.',
  workbook:
    'This project holds Excel workbooks. Rosetta reads a text copy of them, never your computer.',
} as const;

const leadOf = (kind: Project['sourceKind']): string => leads[kind];

function SourceSection({ form }: { readonly form: StartForm }): JSX.Element {
  const { project, actions } = form;
  if (project.sourceKind === 'upload') {
    return <UploadSourceSection project={project} onStored={form.setProject} />;
  }
  if (project.sourceKind === 'workbook') {
    return <WorkbookSourceSection project={project} onStored={form.setProject} />;
  }
  return (
    <RepositorySection
      project={project}
      url={form.url}
      failure={actions.refusals.url}
      busy={actions.busy}
      onUrl={form.setUrl}
      onResolve={actions.resolve}
    />
  );
}

// RF-1001
export function StartRunForm({ project }: { readonly project: Project }): JSX.Element {
  const form = useStartForm(project);
  const { actions, consent } = form;
  const ref = useRef<HTMLDivElement>(null);
  useRefusalFocus(ref, actions.attempts);
  // RF-160: until the scan has finished there are no areas and no estimate, so only the scan shows.
  if (form.choice.estimate.status === 'none') {
    return (
      <div class="rst-start" ref={ref}>
        <div>
          <h1 class="rst-page__title">Start a run</h1>
          <p class="rst-settings__lead">{leadOf(form.project.sourceKind)}</p>
        </div>
        <SourceSection form={form} />
        <ScanSection form={form} />
      </div>
    );
  }
  return (
    <div class="rst-start" ref={ref}>
      <div>
        <h1 class="rst-page__title">Start a run</h1>
        <p class="rst-settings__lead">{leadOf(form.project.sourceKind)}</p>
      </div>
      <SourceSection form={form} />
      <StaleCodeMapNotice form={form} />
      <Columns form={form} />
      {consent.roles.length === 0 ? null : (
        <CloudNotice
          roles={consent.roles}
          consent={consent.checked}
          error={actions.refusals.consent}
          onConsent={consent.set}
        />
      )}
      <PrivateCode form={form} />
      {actions.refusals.start === undefined ? null : <ErrorBanner error={actions.refusals.start} />}
      <SummaryBar form={form} />
      <Confirmation form={form} />
    </div>
  );
}
