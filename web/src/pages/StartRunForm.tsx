import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { HistoryRun } from '../api/history-schemas.js';
import type { Project } from '../api/project-schemas.js';
import type { JourneyView } from '../lib/journey/journey-steps.js';
import { hasRun, headingOf, startsHere } from '../lib/journey/project-heading.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { JourneyPanel } from './JourneyPanel.js';
import { PackageSection } from './PackageSection.js';
import { PlanSetupInPlace } from './PlanSetupInPlace.js';
import { ProjectHeading } from './ProjectHeading.js';
import { ProjectQuestions } from './ProjectQuestions.js';
import { ProjectRuns } from './ProjectRuns.js';
import { RepositorySection } from './RepositorySection.js';
import { ScanSection } from './ScanSection.js';
import { StartChoices } from './StartChoices.js';
import { UploadSourceSection } from './UploadSourceSection.js';
import { useHistory } from './use-history.js';
import { useStartForm, type StartForm } from './use-start-form.js';
import { WorkbookSourceSection } from './WorkbookSourceSection.js';

// RF-1001, RF-1021, RF-1022, RF-160, DEC-211, design-system.md section 14 (Start run, P8Project): the
// project page. Before the first run it starts one (source, scan, areas, estimate, Analyse). Once the
// project has a run it is the page of the journey: the name and the current step as the title, the
// strip, the package and its cost, the questions left on their defaults, the runs, and the source
// and the areas folded away ("Replace the source", "Start another run"). A refusal shows next to the
// field it names and focus moves to the first of them; one that names no field shows above Analyse.

/** RF-1020: the queued or running run of the project, which the strip step that waits links to. */
function liveRunOf(runs: readonly HistoryRun[]): string | undefined {
  return runs.find((run) => run.queueState !== 'Ended')?.id;
}

const leads = {
  github:
    'Paste a public GitHub repository URL. Rosetta pins it to a commit and downloads that snapshot once.',
  upload: 'This project holds a zip of your code. Rosetta reads that copy, never your computer.',
  workbook:
    'This project holds Excel workbooks. Rosetta reads a text copy of them, never your computer.',
} as const;

const replaceLeads = {
  upload:
    'Upload a new zip of the same application. The scan runs again and later steps are marked out of date; this package stays in History.',
  workbook:
    'Upload new workbooks of the same application. The scan runs again and later steps are marked out of date; this package stays in History.',
} as const;

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

/** P8-26: once a run exists a new version of an upload is made from a collapsed section. */
function Source(props: {
  readonly form: StartForm;
  readonly started: boolean;
  readonly open: boolean;
}): JSX.Element {
  const { form, started, open } = props;
  const kind = form.project.sourceKind;
  if (!started || kind === 'github') return <SourceSection form={form} />;
  return (
    <details class="rst-card rst-p826-fold" open={open} data-testid="replace-source">
      <summary>Replace the source</summary>
      <p class="rst-settings__note">{replaceLeads[kind]}</p>
      <SourceSection form={form} />
    </details>
  );
}

/** RF-1020, RF-1021: the journey strip of the project page, with the next step in place. */
function ProjectJourney(props: {
  readonly form: StartForm;
  readonly liveRunId: string | undefined;
  readonly onView: (view: JourneyView | undefined) => void;
}): JSX.Element {
  const { form } = props;
  return (
    <JourneyPanel
      projectId={form.project.id}
      runId={undefined}
      refresh={form.scan.state.kind}
      pagePath={`/projects/${form.project.id}`}
      deepenInPlace
      onView={props.onView}
      liveRunId={props.liveRunId}
      rerun={{
        answered: form.rerun.answered,
        checked: form.rerun.checked,
        onChange: form.rerun.set,
      }}
      setupInPlace={(onSaved) => <PlanSetupInPlace projectId={form.project.id} onSaved={onSaved} />}
    />
  );
}

/** The package, the questions and the runs: what the page adds once the project has a run. */
function AfterJourney(props: {
  readonly view: JourneyView;
  readonly runs: readonly HistoryRun[];
}): JSX.Element {
  return (
    <>
      <PackageSection view={props.view} />
      <ProjectQuestions view={props.view} />
      <ProjectRuns runs={props.runs} />
    </>
  );
}

// RF-1001
export function StartRunForm({ project }: { readonly project: Project }): JSX.Element {
  const form = useStartForm(project);
  const [view, setView] = useState<JourneyView | undefined>();
  const { state } = useHistory(project.id);
  const runs = state.status === 'ready' ? state.history.runs : [];
  const ref = useRef<HTMLDivElement>(null);
  useRefusalFocus(ref, form.actions.attempts);
  // RF-160: until the scan has finished (or while a replaced source is scanned again) only it shows.
  const scanning = form.scan.state.kind === 'starting' || form.scan.state.kind === 'scanning';
  const onlyScan = form.choice.estimate.status === 'none' || scanning;
  const started = hasRun(view);
  const heading = headingOf(project.name, view);
  return (
    <div class="rst-start" ref={ref}>
      <ProjectHeading heading={heading} project={form.project} started={started} />
      {started ? null : <p class="rst-settings__lead">{leads[form.project.sourceKind]}</p>}
      <ProjectJourney form={form} liveRunId={liveRunOf(runs)} onView={setView} />
      {view !== undefined && started ? <AfterJourney view={view} runs={runs} /> : null}
      <Source form={form} started={started} open={onlyScan} />
      {onlyScan || form.scan.state.kind === 'failed' ? <ScanSection form={form} /> : null}
      {onlyScan ? null : <Choices form={form} open={startsHere(view)} />}
    </div>
  );
}

/** The areas, estimate and Analyse: open while the journey starts, folded once there is a run. */
function Choices(props: { readonly form: StartForm; readonly open: boolean }): JSX.Element {
  if (props.open) return <StartChoices form={props.form} />;
  return (
    <details class="rst-card rst-p826-fold" data-testid="start-another">
      <summary>Start another run</summary>
      <StartChoices form={props.form} />
    </details>
  );
}
