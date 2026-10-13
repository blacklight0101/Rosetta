import type { JSX } from 'preact';
import type { TopBarMeter } from '../lib/live-run/top-bar-meter.js';

// RF-1003, RF-1010, DEC-49, design-system.md section 5 (header totals, cost meter): the "This run"
// meter of the top bar: the cost so far against the run's cap, as figures, a bar and the share. From
// 80% it warns and from 95% it is in danger, and says so in words.

// RF-1003
export function TopbarRunMeter({ meter }: { readonly meter: TopBarMeter }): JSX.Element {
  return (
    <div
      class={`rst-topbar-runmeter rst-topbar-runmeter--${meter.level}`}
      role="group"
      aria-label="Run cost"
      data-testid="topbar-run-meter"
      data-level={meter.level}
    >
      <span class="rst-topbar-runmeter-label">This run</span>
      <span class="rst-topbar-runmeter-figures">
        <strong>{meter.spent}</strong> <span class="rst-topbar-runmeter-label">of {meter.cap}</span>
      </span>
      <div
        class="rst-topbar-runmeter-bar"
        role="meter"
        aria-label="This run spent against cap"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meter.share}
        aria-valuetext={meter.valueText}
      >
        <div class="rst-topbar-runmeter-fill" style={{ inlineSize: `${String(meter.share)}%` }} />
      </div>
      <span class="rst-topbar-runmeter-share">{`${String(meter.share)}%`}</span>
      {meter.note === undefined ? null : <span class="rst-topbar-runmeter-note">{meter.note}</span>}
    </div>
  );
}
