import type { ReplayAgent, ReplayStep } from '../../application/report/replay-model.js';
import type { ReportModel } from '../../application/report/report-model.js';
import { escapeHtml, renderModelText } from './html-text.js';
import { renderPage } from './page-shell.js';
import { isUploadModel } from './report-source.js';
import { dollars, formatDuration, formatOffset, plural } from './report-format.js';

// RF-506, RF-507, RF-1013: `replay.html`, the "Run replay" page. Without JavaScript it is the whole
// timeline as a list, in order. One script of the report folder (`replay.js`) reveals play, pause,
// step and restart controls and shows the steps one by one; the page works the same without it.
// Every text of the run (a file name, a card title, a verdict's reason) is shown as text; only
// links to github.com in model text stay links.

function stepItem(step: ReplayStep): string {
  const cost = dollars(step.costMicros);
  return `<li class="step step-${step.kind}" data-seq="${String(step.seq)}" data-cost="${cost}" data-tokens="${String(step.tokens)}">
<time datetime="${escapeHtml(step.at)}">${formatOffset(step.offsetMs)}</time>
<span class="label">${escapeHtml(step.label)}</span>
<span class="text">${renderModelText(step.text)}</span>
<span class="running"><span>${cost}</span> <span>${plural(step.tokens, 'token')}</span></span>
</li>`;
}

function agentRow(agent: ReplayAgent): string {
  const cells: readonly [string, string][] = [
    ['Area', renderModelText(agent.area)],
    ['Role', renderModelText(agent.role)],
    ['Model', renderModelText(agent.model)],
    ['State', escapeHtml(agent.state)],
    ['Turns', String(agent.turns)],
    ['Cards', String(agent.cards)],
  ];
  return `<tr>${cells.map(([label, cell]) => `<td data-label="${label}">${cell}</td>`).join('')}</tr>`;
}

function agentsSection(agents: readonly ReplayAgent[]): string {
  if (agents.length === 0) return '';
  return `<section aria-labelledby="agents">
<h2 id="agents">Agents</h2>
<div class="table-wrap" role="region" aria-label="Agents of the run" tabindex="0">
<table class="stacked">
<thead><tr><th scope="col">Area</th><th scope="col">Role</th><th scope="col">Model</th><th scope="col">State</th><th scope="col">Turns</th><th scope="col">Cards</th></tr></thead>
<tbody>
${agents.map(agentRow).join('\n')}
</tbody>
</table>
</div>
</section>`;
}

const CONTROLS = `<div class="controls" data-replay-controls hidden>
<button type="button" data-action="play">Play</button>
<button type="button" data-action="pause">Pause</button>
<button type="button" data-action="step">Step</button>
<button type="button" data-action="restart">Restart</button>
<p class="status" role="status" aria-live="polite" data-replay-status></p>
</div>`;

function timeline(steps: readonly ReplayStep[]): string {
  return `<section aria-labelledby="timeline">
<h2 id="timeline">Timeline</h2>
${CONTROLS}
<ol class="timeline" data-replay-steps data-total="${String(steps.length)}">
${steps.map(stepItem).join('\n')}
</ol>
</section>`;
}

const LEDE =
  "How the agents worked on this run, step by step: their turns, the files they read, the cards they proposed, the verifier's verdicts and the cost as it grew.";

function summaryOf(model: ReportModel): string {
  const { replay } = model;
  if (replay.steps.length === 0) return '<p>This run recorded no events.</p>';
  const parts = [
    plural(replay.steps.length, 'step'),
    formatDuration(replay.durationMs),
    dollars(replay.totalCostMicros),
    plural(replay.totalTokens, 'token'),
  ];
  return `<p class="summary">${parts.map((part) => `<span>${part}</span>`).join(' ')}</p>`;
}

// RF-506, RF-507, RF-1013
export function renderReplayHtml(model: ReportModel): string {
  const { replay } = model;
  const empty = replay.steps.length === 0;
  const main = [
    '<h1>Run replay</h1>',
    `<p class="lede">${LEDE}</p>`,
    summaryOf(model),
    agentsSection(replay.agents),
    empty ? '' : timeline(replay.steps),
  ].filter((part) => part !== '');
  return renderPage({
    page: 'replay',
    runKey: model.runKey,
    title: 'Run replay',
    main: main.join('\n'),
    upload: isUploadModel(model),
    ...(empty ? {} : { scripts: ['replay.js'] }),
  });
}
