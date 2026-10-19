import type { JSX } from 'preact';
import type { ApiFailure } from '../api/client.js';
import type { BriefView, Catalogue, PlanSource } from '../api/plan-schemas.js';
import type { Project } from '../api/project-schemas.js';
import { useRouteParams } from '../app/route-params.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { PlanConsentNotice } from './PlanConsentNotice.js';
import { PlanEstimateCard } from './PlanEstimateCard.js';
import { PlanRecorded } from './PlanRecorded.js';
import { PlanStepBody } from './PlanStepBody.js';
import { PlanStepButtons } from './PlanStepButtons.js';
import { PlanSourcePanel } from './PlanSourcePanel.js';
import { PlanSteps } from './PlanSteps.js';
import { usePlanSession } from './use-plan-session.js';
import { usePlanSetupLoad } from './use-plan-setup-load.js';

// RF-605, RF-608, RF-609, RF-613, RF-614, design-system.md section 14 (Plan setup): `/projects/:projectId/
// plan-setup`, the interview Rosetta runs before it plans. Six steps, each question with its
// default and the reason it matters; the options of the architecture and the stack come from the
// planner; "What I recorded" and the estimate sit under the step; "Write the package" starts `plan`.

const lead =
  'Rosetta writes the hand-off package from these choices. Every question has a default; answer what you know and the rest is listed as an open question in the package.';

function OutOfDate(): JSX.Element {
  return (
    <section class="rst-callout rst-callout--warn" role="status">
      <p class="rst-callout__message">
        The package is out of date: the brief changed after it was written.
      </p>
      <p class="rst-callout__next-step">Write the package again to use your latest answers.</p>
    </section>
  );
}

/** The title, what the page does and the understand run it plans from (RF-614). */
function Head(props: {
  readonly source: PlanSource | undefined;
  readonly error: ApiFailure | undefined;
}): JSX.Element {
  return (
    <>
      <div>
        <h1 class="rst-page__title">Plan setup</h1>
        <p class="rst-settings__lead">{lead}</p>
      </div>
      <PlanSourcePanel source={props.source} error={props.error} />
    </>
  );
}

interface BodyProps {
  readonly projectId: string;
  readonly catalogue: Catalogue;
  readonly view: BriefView;
  readonly project: Project;
  readonly source: PlanSource | undefined;
  readonly sourceError: ApiFailure | undefined;
  readonly sourceRunId: string | undefined;
}

function PlanSetupBody(props: BodyProps): JSX.Element {
  const { projectId, catalogue, view, project, source, sourceError, sourceRunId } = props;
  const session = usePlanSession({ projectId, sourceRunId }, view, project);
  return (
    <div class="rst-plan">
      <Head source={source} error={sourceError} />
      {session.outOfDate ? <OutOfDate /> : null}
      <PlanSteps current={session.step} onOpen={session.goTo} />
      <section class="rst-plan-card">
        <PlanStepBody
          step={session.step}
          draft={session.draft}
          catalogue={catalogue}
          change={session.change}
          problems={session.problems}
          load={session.options}
          waitingForConsent={session.cloud && !session.consent}
          askAgain={session.askAgain}
        />
        <PlanStepButtons
          step={session.step}
          saving={session.saving}
          error={session.error}
          onBack={session.back}
          onDefaults={session.useDefaults}
          onSave={session.save}
        />
      </section>
      {session.cloud ? (
        <PlanConsentNotice
          provider={session.plannerProvider}
          consent={session.consent}
          onConsent={session.setConsent}
        />
      ) : null}
      <PlanRecorded draft={session.draft} catalogue={catalogue} />
      <PlanEstimateCard
        projectId={projectId}
        sourceRunId={sourceRunId}
        sourceRefused={sourceError !== undefined}
        load={session.estimate}
        blockers={session.blockers}
        consent={session.consent}
        stepReason={session.stepReason}
        outOfDate={session.outOfDate}
      />
    </div>
  );
}

// RF-605
export function PlanSetupPage(): JSX.Element {
  const projectId = useRouteParams()['projectId'] ?? '';
  const load = usePlanSetupLoad(projectId);
  if (load.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading Plan setup
      </p>
    );
  }
  if (load.status === 'failed') {
    return (
      <div class="rst-plan">
        <h1 class="rst-page__title">Plan setup</h1>
        <ErrorBanner error={load.error} />
      </div>
    );
  }
  return (
    <PlanSetupBody
      projectId={projectId}
      catalogue={load.catalogue}
      view={load.view}
      project={load.project}
      source={load.source}
      sourceError={load.sourceError}
      sourceRunId={load.sourceRunId}
    />
  );
}
