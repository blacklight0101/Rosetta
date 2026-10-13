import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import type { Project } from '../api/project-schemas.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { CloudNotice } from './CloudNotice.js';
import { EstimateSection } from './EstimateSection.js';
import { RepositorySection } from './RepositorySection.js';
import { RunNotice } from './RunNotice.js';
import { StageAreasSection } from './StageAreasSection.js';
import { useStartForm, type StartForm } from './use-start-form.js';

// RF-1001, RF-143, RF-425, RF-1108, DEC-108, design-system.md section 14 (Start run): the page
// body. Repository, stage and areas, the estimate with the run cap, the cloud notice with its
// consent, the queue notice, Start. A refusal shows next to the field it names and focus moves to
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
      />
      <EstimateSection
        scanOnly={stage === 'scan'}
        estimate={estimate}
        warnings={warnings}
        onRetry={choice.reestimate}
        cap={{
          text: form.capText,
          capMicros: form.capMicros,
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

function Actions({ form }: { readonly form: StartForm }): JSX.Element {
  const { actions, gate, choice, stage } = form;
  const waiting = actions.notice?.kind === 'queued' || actions.notice?.kind === 'started';
  const canEstimate = stage === 'understand' || choice.estimate.status === 'none';
  return (
    <div class="rst-start__actions">
      {canEstimate ? <Button onClick={choice.reestimate}>Re-estimate</Button> : null}
      {waiting ? null : (
        <Button
          variant="primary"
          busy={actions.busy}
          {...(gate.reason === undefined ? {} : { disabledReason: gate.reason })}
          onClick={actions.submit}
        >
          {gate.label}
        </Button>
      )}
    </div>
  );
}

// RF-1001
export function StartRunForm({ project }: { readonly project: Project }): JSX.Element {
  const form = useStartForm(project);
  const { actions, consent } = form;
  const ref = useRef<HTMLDivElement>(null);
  useRefusalFocus(ref, actions.attempts);
  return (
    <div class="rst-start" ref={ref}>
      <div>
        <h1 class="rst-page__title">Start a run</h1>
        <p class="rst-settings__lead">
          Paste a public GitHub repository URL. Rosetta pins it to a commit and downloads that
          snapshot once.
        </p>
      </div>
      <RepositorySection
        project={form.project}
        url={form.url}
        failure={actions.refusals.url}
        busy={actions.busy}
        onUrl={form.setUrl}
        onResolve={actions.resolve}
      />
      <Columns form={form} />
      {consent.roles.length === 0 ? null : (
        <CloudNotice
          roles={consent.roles}
          consent={consent.checked}
          error={actions.refusals.consent}
          onConsent={consent.set}
        />
      )}
      {actions.refusals.start === undefined ? null : <ErrorBanner error={actions.refusals.start} />}
      {actions.notice === undefined ? null : (
        <RunNotice notice={actions.notice} busy={actions.busy} onCancel={actions.cancel} />
      )}
      <Actions form={form} />
    </div>
  );
}
