import type { JSX } from 'preact';
import type { CoverageListing } from '../api/coverage.js';
import type { CodeAreaInfo } from '../lib/live-run/code-map-tiles.js';
import { BreakableText } from '../components/BreakableText.js';
import { coverageOf, type AreaCoverage, type CoverageNode } from '../lib/live-run/coverage-map.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-1005, RF-230, DEC-51, design-system.md section 14 (live run): the coverage map of the live run
// page. One block per area in plan order with the area's share of the files read as a meter and
// its files as a tree of folders; it fills in as `read_file` calls succeed. When the run lists the
// files of its areas, every file is shown as read or "not read", and an area nobody read is listed
// too. Paths and notes are shown as text.

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

/** `3 files read`, or `3 of 12 files read` when the files of the area are listed. */
function filesLabel(read: number, total?: number): string {
  if (total === undefined) return plural(read, 'file read', 'files read');
  return `${String(read)} of ${plural(total, 'file', 'files')} read`;
}

function Tree({ nodes }: { readonly nodes: readonly CoverageNode[] }): JSX.Element {
  return (
    <ul class="rst-p138-tree">
      {nodes.map((node) => (
        <li key={node.path} class={`rst-p138-node rst-p138-node--${node.kind}`}>
          <span class="rst-p138-name">
            <BreakableText text={node.kind === 'folder' ? `${node.name}/` : node.name} />
          </span>
          {node.kind === 'file' && !node.read ? (
            <span class="rst-p138-unread">not read</span>
          ) : null}
          {node.children.length === 0 ? null : <Tree nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}

/** Why an area has no file in its tree: nobody has read one yet, or the run ended without one. */
function emptyNote(area: AreaCoverage, ended: boolean): string {
  const none = ended ? 'No files read.' : 'No files read yet.';
  const listed = area.filesTotal;
  return listed === undefined
    ? none
    : `${none} The code map lists ${plural(listed, 'file', 'files')} in this area.`;
}

function Area(props: { readonly area: AreaCoverage; readonly ended: boolean }): JSX.Element {
  const { area, ended } = props;
  const share = `${String(area.share)}%`;
  return (
    <section class="rst-p138-area" aria-label={`Coverage of ${area.area}`}>
      <div class="rst-p138-area-head">
        <h3 class="rst-p138-area-name">
          <BreakableText text={area.area} />
        </h3>
        <span class="rst-p138-area-figures">
          {filesLabel(area.filesRead, area.filesTotal)} · {share} of all files read
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
      {area.note === undefined ? null : <p class="rst-p138-note">{`Note: ${area.note}`}</p>}
      {area.tree.length === 0 ? (
        <p class="rst-p138-note">{emptyNote(area, ended)}</p>
      ) : (
        <Tree nodes={area.tree} />
      )}
    </section>
  );
}

function summaryOf(areas: readonly AreaCoverage[], read: number, total?: number): string {
  const readAreas = areas.filter((area) => area.filesRead > 0).length;
  if (read === 0 && total === undefined) return filesLabel(0);
  const head = `${filesLabel(read, total)} in ${plural(readAreas, 'area', 'areas')}`;
  const unread = total === undefined ? 0 : areas.length - readAreas;
  return unread === 0 ? head : `${head} · ${plural(unread, 'area', 'areas')} not read`;
}

interface CoverageMapProps {
  readonly state: RunState;
  /** The files of every area with the lines read (RF-230); without it the map shows the reads. */
  readonly coverage?: CoverageListing | undefined;
  /** The areas of the code map, so one nobody has read yet is still listed. */
  readonly areas?: readonly CodeAreaInfo[] | undefined;
}

// RF-1005, RF-230
export function CoverageMap({ state, coverage, areas }: CoverageMapProps): JSX.Element {
  const map = coverageOf(state, coverage, areas);
  return (
    <section class="rst-p138-coverage" aria-label="Coverage map">
      <h2 class="rst-p138-title">Coverage map</h2>
      <p class="rst-p138-note">{summaryOf(map.areas, map.filesRead, map.filesTotal)}</p>
      {map.areas.length === 0 ? (
        <p class="rst-p138-note">No areas yet. They appear when the run plans its work.</p>
      ) : (
        <div class="rst-p138-areas">
          {map.areas.map((area) => (
            <Area key={area.area} area={area} ended={state.ended !== undefined} />
          ))}
        </div>
      )}
    </section>
  );
}
