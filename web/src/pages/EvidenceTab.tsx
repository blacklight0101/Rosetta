import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { RunEstimate } from '../api/estimate-schemas.js';
import type { RunRow } from '../api/run-schemas.js';
import { tilesOf } from '../lib/live-run/code-map-tiles.js';
import type { RunState, SourceState } from '../lib/live-run/run-state.js';
import { AgentsTab } from './AgentsTab.js';
import { CardsTab } from './CardsTab.js';
import { CodeMap } from './CodeMap.js';
import { useCodeAreas } from './use-code-areas.js';
import { endedAgents, useRunCoverage } from './use-run-coverage.js';

// RF-1015, RF-1002..RF-1005, DEC-137: the "Evidence" tab of an ended run: the code map as the run
// left it, the cards with their claims and citations, and the agents with the cost per role and the
// coverage per area. A tile of the code map shows the agents of its area alone.

export interface EvidenceTabProps {
  readonly run: RunRow;
  readonly state: RunState;
  readonly stage: string;
  readonly costMicros: number;
  readonly estimate: RunEstimate | undefined;
  readonly source: SourceState | undefined;
}

// RF-1015
export function EvidenceTab(props: EvidenceTabProps): JSX.Element {
  const { run, state, stage } = props;
  const [area, setArea] = useState<string | undefined>();
  const areas = useCodeAreas(run.projectId, stage);
  const coverage = useRunCoverage(run.id, stage, endedAgents(state));
  return (
    <div class="rst-p170-evidence">
      {stage === 'understand' ? (
        <CodeMap tiles={tilesOf(state, areas)} stage={stage} onOpenArea={setArea} />
      ) : null}
      <CardsTab state={state} claims={state.claims} source={props.source} />
      <AgentsTab
        {...{ state, stage, area, coverage }}
        codeAreas={areas}
        costMicros={props.costMicros}
        estimate={props.estimate}
        onShowAll={() => {
          setArea(undefined);
        }}
      />
    </div>
  );
}
