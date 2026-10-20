import type { JSX } from 'preact';
import type { CoverageListing } from '../api/coverage.js';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { Button } from '../components/Button.js';
import type { CodeAreaInfo } from '../lib/live-run/code-map-tiles.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { AgentsGrid } from './AgentsGrid.js';
import { CoverageMap } from './CoverageMap.js';
import { RunMeter } from './RunMeter.js';
import { RunOverview } from './RunOverview.js';

// RF-1002, RF-1003, RF-1005, RF-1015, DEC-137: the "All agents" tab: the overview of the agents, the
// run meter with the tokens and cost per role and the estimate, one panel per agent and the files
// read per area. A tile of the code map opens the tab on that area's agents alone.

export interface AgentsTabProps {
  readonly state: RunState;
  /** The stage of the run; a scan has no files read per area to show. */
  readonly stage: string;
  readonly costMicros: number;
  readonly estimate: RunEstimate | undefined;
  /** The files of every area with the lines read, once the run has listed them (RF-230). */
  readonly coverage?: CoverageListing | undefined;
  /** The areas of the code map, so the coverage map lists an area nobody read yet. */
  readonly codeAreas?: readonly CodeAreaInfo[] | undefined;
  /** The area a tile opened, if any. */
  readonly area: string | undefined;
  readonly onShowAll: () => void;
}

function Focused(props: AgentsTabProps): JSX.Element {
  return (
    <>
      <div class="rst-agents-focus">
        <p class="rst-agents-focus__note">
          Showing the agents of <b>{props.area}</b>.
        </p>
        <Button variant="secondary" onClick={props.onShowAll}>
          Show all agents
        </Button>
      </div>
      <AgentsGrid state={props.state} area={props.area} />
    </>
  );
}

// RF-1015
export function AgentsTab(props: AgentsTabProps): JSX.Element {
  if (props.area !== undefined) return <Focused {...props} />;
  const { state } = props;
  return (
    <>
      <RunOverview state={state} />
      <RunMeter state={state} costMicros={props.costMicros} estimate={props.estimate} />
      <AgentsGrid state={state} />
      {props.stage === 'understand' ? (
        <CoverageMap state={state} coverage={props.coverage} areas={props.codeAreas} />
      ) : null}
    </>
  );
}
