import type { JSX } from 'preact';
import { useContext } from 'preact/hooks';
import { waitsForAnswer } from '../api/answers.js';
import type { RunRow } from '../api/run-schemas.js';
import type { MeasureFigures } from '../api/understanding.js';
import { Link } from '../components/Link.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { packageSectionId } from './focus-package.js';
import { PackageChecks } from './PackageChecks.js';
import { RunDownloads } from './RunDownloads.js';
import { RunReport } from './RunReport.js';
import type { AnswersLoad } from './use-run-answers.js';
import type { OverviewLoad } from './use-run-overview.js';
import type { UnderstandingLoad } from './use-understanding.js';
import { AreaReadContext } from './area-read-context.js';
import { YourTurn } from './YourTurn.js';

// RF-1015, RF-1017: the rail beside the results of an ended run: the Your turn panel and the report
// and downloads (the package section of a plan run).

export interface RailProps {
  readonly run: RunRow;
  readonly stage: string;
  readonly state: RunState;
  readonly costMicros: number;
  readonly failed: boolean;
  readonly asks: boolean;
  readonly answers: AnswersLoad;
  /** RF-209: the run can be deepened (it ended Completed); undefined otherwise. */
  readonly deepenRunId: string | undefined;
  readonly overview: OverviewLoad;
  readonly onResumed: () => void;
  readonly report: { readonly onBuilt: () => void };
  readonly onAnswer: () => void;
  /** RF-231, P8-84: the understanding of the run, for what "Your turn" says the readers covered. */
  readonly understanding?: UnderstandingLoad | undefined;
}

/** The Your turn panel, and the report, the downloads and the calls link, one click away. */
export function Rail(props: RailProps): JSX.Element {
  const { run, stage } = props;
  const { reading } = useContext(AreaReadContext);
  return (
    <aside class="rst-p170-rail">
      <YourTurn {...props} reading={reading} measures={measuresOf(props.understanding)} />
      <section
        id={packageSectionId}
        class="rst-card rst-p170-downloads"
        aria-label={stage === 'plan' ? 'Package' : 'Report and downloads'}
        tabIndex={-1}
      >
        <RunReport runId={run.id} ended onBuilt={props.report.onBuilt} />
        <RunDownloads runId={run.id} stage={stage} ended />
        {stage === 'plan' ? <PackageChecks runId={run.id} ended={props.state.ended} /> : null}
        <p class="rst-p137-live-link">
          <Link href={`/runs/${encodeURIComponent(run.id)}/calls`}>API calls and logs</Link>
        </p>
      </section>
    </aside>
  );
}

/** The measures of the run once read; null when it has none or they are not read yet. */
function measuresOf(load: UnderstandingLoad | undefined): MeasureFigures | null {
  return load?.status === 'ready' ? load.understanding.measures : null;
}

/** How many questions wait for an answer; none known until they are read. */
export function openQuestions(answers: AnswersLoad): number | undefined {
  if (answers.status !== 'ready') return undefined;
  return answers.questions.filter(waitsForAnswer).length;
}
