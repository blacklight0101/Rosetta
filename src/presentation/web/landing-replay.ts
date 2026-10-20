import {
  citedLines,
  events,
  lanes,
  steps,
  type Lane,
  type ReplayEvent,
  type Step,
} from './landing-content.js';
import { escapeHtml as esc } from './html-text.js';

// RF-1200, design-system.md section 14: the "Watch it work" replay stage and the pipeline rail.
// The replay is a static sample run drawn by CSS animation (10 s cycle, paused on hover or focus,
// still under prefers-reduced-motion); it needs no script. The markup follows
// docs/design/board/Landing.dc.html with every inline style turned into a class.

function laneState(lane: Lane): string {
  if (lane.final === undefined) {
    const tone = lane.stateClass === '' ? '' : ` ${lane.stateClass}`;
    return `<span class="swap"><span class="badge${tone}">${esc(lane.state)}</span></span>`;
  }
  // The first state is decoration for the eye; assistive technology reads the state the run ends on.
  return (
    '<span class="swap">' +
    `<span class="badge ${lane.stateClass} swap-a" aria-hidden="true">${esc(lane.state)}</span>` +
    `<span class="badge ok swap-b">${esc(lane.final)}</span></span>`
  );
}

function renderLane(lane: Lane): string {
  return `<div class="lane">
  <div class="lane-role">
    <span class="dot ${lane.tone}" aria-hidden="true"></span>
    <div><strong>${esc(lane.role)}</strong><div class="lbl">${esc(lane.what)}</div></div>
  </div>
  <div class="tl" aria-hidden="true"><span class="seg seg-${String(lane.bar)} ${lane.tone}"></span></div>
  ${laneState(lane)}
</div>`;
}

function count(label: string, value: string, tone: string, of?: string): string {
  const suffix = of === undefined ? '' : ` <span class="lbl">${esc(of)}</span>`;
  return `<div><div class="lbl">${esc(label)}</div><div class="count${tone}">${esc(value)}${suffix}</div></div>`;
}

function renderCounts(): string {
  return `<div class="counts">
  ${count('Supported', '24', ' count-ok')}
  ${count('Rejected', '4', ' count-no')}
  ${count('Citation invalid', '3', ' count-wn')}
  ${count('Files read', '71', '', 'of 74')}
</div>`;
}

function renderEvent(event: ReplayEvent): string {
  return `<li class="ev"><span class="lbl">${esc(event.time)}</span><span>${esc(event.text)}</span></li>`;
}

const repository = 'eShopLegacyWebForms @ 3f2a9c1';

function renderStageBar(): string {
  return `<div class="stage-bar">
  <span class="rst-live-dot live" aria-hidden="true"></span>
  <strong>Replay</strong>
  <span class="rst-mono repo"><span class="trunc" title="${esc(repository)}">${esc(repository)}</span><span class="nw">· understand</span></span>
  <span class="badge wn">Sample run</span>
  <div class="grow"></div>
  <div class="meter" role="meter" aria-label="Run cost" aria-valuemin="0" aria-valuemax="0.5" aria-valuenow="0.39" aria-valuetext="$0.39 of $0.50 cap">
    <span class="lbl">Cost</span>
    <div class="trk"><div class="fill"></div></div>
    <strong>$0.39</strong><span class="lbl nw">of $0.50 cap</span>
  </div>
</div>`;
}

// RF-1200
export function renderReplay(): string {
  return `<section class="wrap replay" aria-label="Replay of a sample run">
  <h2 class="sr-only">Watch it work</h2>
  <div class="stage" tabindex="0" role="group" aria-label="Sample run replay">
    ${renderStageBar()}
    <div class="stage-body">
      <div class="lanes">
        ${lanes.map(renderLane).join('\n        ')}
        ${renderCounts()}
      </div>
      <ul class="events" aria-label="Event stream">
        ${events.map(renderEvent).join('\n        ')}
      </ul>
    </div>
  </div>
  <p class="lbl note">Sample run of Microsoft's eShopLegacyWebForms (MIT), shown for illustration. Hover or focus the replay to pause it.</p>
</section>`;
}

function renderStep(step: Step): string {
  const tone = step.tone === undefined ? '' : ` step-${step.tone}`;
  return `<li class="step${tone}"><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p><span class="out">Leaves <span class="rst-mono">${esc(step.leaves)}</span></span></li>`;
}

// RF-1200
export function renderPipeline(): string {
  return `<section id="how" class="sec-band">
  <div class="wrap stack">
    <div class="how-head">
      <h2>From a GitHub URL, a zip or Excel workbooks to a hand-off your team can build from.</h2>
      <p class="lede">Six stages, each leaving files you can open. Rosetta never edits the code it reads and never rebuilds the system for you.</p>
    </div>
    <ol class="rail" aria-label="Pipeline">
      ${steps.map(renderStep).join('\n      ')}
    </ol>
  </div>
</section>`;
}

const tick =
  '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path class="glyph" d="M2 6.5 5 9.5 10 3"></path></svg>';
const cross =
  '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path class="glyph" d="M3 3l6 6M9 3 3 9"></path></svg>';

function renderCitedLines(): string {
  const rows = citedLines.map(
    (line) =>
      `<div${line.highlighted ? ' class="hl"' : ''}><i>${String(line.number)}</i>${esc(line.code)}</div>`,
  );
  return `<div class="code" role="region" aria-label="Cited lines" tabindex="0">
${rows.join('\n')}
</div>`;
}

// RF-1200
export function renderEvidence(): string {
  return `<section id="evidence" class="sec-band alt">
  <div class="wrap split">
    <div class="intro">
      <h2>No claim without the lines that prove it.</h2>
      <p class="lede">Each card cites a file and a line range at one commit. A check in code throws out citations that do not exist; a second model reads the cited lines and marks the claim supported or rejected. Rejected claims stay in the report, marked, never deleted.</p>
    </div>
    <div class="cards">
      <article class="claim">
        <div class="claim-head"><h3>A catalog item cannot be saved with a negative price.</h3><span class="badge ok">${tick}Supported</span></div>
        <div class="cite-row"><span class="rst-mono cite">src/eShopLegacyWebForms/Catalog/Create.aspx.cs:41-47</span><span class="lbl">BR-007 · Catalog · business rule</span></div>
        ${renderCitedLines()}
        <p class="lbl">Verifier: lines 42-43 reject a negative price before the item is saved.</p>
      </article>
      <article class="rejected">
        <span class="badge no">${cross}Rejected</span>
        <strong>Orders over $100 get a 10% discount.</strong>
        <span class="lbl">The cited lines in OrderService.cs compute a total; they apply no discount. Kept in the report so you can see what the model got wrong.</span>
      </article>
      <p class="lbl">Sample cards. Line numbers are illustrative until the first real demo run replaces them.</p>
    </div>
  </div>
</section>`;
}
