import type { JSX } from 'preact';
import type { CoverageListing } from '../api/coverage.js';
import type { CodeAreaInfo } from '../lib/live-run/code-map-tiles.js';
import { coverageOf, type AreaCoverage, type CoverageNode } from '../lib/live-run/coverage-map.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1005, DEC-51, design-system.md section 14 (live run): the coverage map of the live run page.
// One block per area in plan order with the area's share of the files read as a meter and the files
// its agents have read as a tree of folders; it fills in as `read_file` calls succeed. Paths are
// shown as text.

function filesLabel(count: number): string {
  return `${String(count)} ${count === 1 ? 'file' : 'files'} read`;
}

function Tree({ nodes }: { readonly nodes: readonly CoverageNode[] }): JSX.Element {
  return (
    <ul class="rst-p138-tree">
      {nodes.map((node) => (
        <li key={node.path} class={`rst-p138-node rst-p138-node--${node.kind}`}>
          <span class="rst-p138-name">{node.kind === 'folder' ? `${node.name}/` : node.name}</span>
          {node.children.length === 0 ? null : <Tree nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

function Area({ area }: { readonly area: AreaCoverage }): JSX.Element {
  const share = `${String(area.share)}%`;
  return (
    <section class="rst-p138-area" aria-label={`Coverage of ${area.area}`}>
      <div class="rst-p138-area-head">
        <h3 class="rst-p138-area-name">{area.area}</h3>
        <span class="rst-p138-area-figures">
          {filesLabel(area.filesRead)} · {share} of the reads
        </span>
      </div>
      <div
        class="rst-p138-meter"
        role="meter"
        aria-label={`Read share of ${area.area}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={area.share}
        aria-valuetext={share}
      >
        <div class="rst-p138-meter-fill" style={{ inlineSize: share }} />
      </div>
      {area.tree.length === 0 ? (
        <p class="rst-p138-note">No files read yet.</p>
      ) : (
        <Tree nodes={area.tree} />
      )}
    </section>
  );
}

// RF-1005
export function CoverageMap(props: {
  readonly state: RunState;
  readonly coverage?: CoverageListing | undefined;
  readonly areas?: readonly CodeAreaInfo[] | undefined;
}): JSX.Element {
  const { state, coverage, areas } = props;
  const map = coverageOf(state, coverage, areas);
  const readAreas = map.areas.filter((area) => area.filesRead > 0).length;
  const summary =
    map.filesRead === 0
      ? filesLabel(0)
      : `${filesLabel(map.filesRead)} in ${String(readAreas)} ${readAreas === 1 ? 'area' : 'areas'}`;
  return (
    <section class="rst-p138-coverage" aria-label="Coverage map">
      <h2 class="rst-p138-title">Coverage map</h2>
      <p class="rst-p138-note">{summary}</p>
      {map.areas.length === 0 ? (
        <p class="rst-p138-note">No areas yet. They appear when the run plans its work.</p>
      ) : (
        <div class="rst-p138-areas">
          {map.areas.map((area) => (
            <Area key={area.area} area={area} />
          ))}
        </div>
      )}
    </section>
  );
}
