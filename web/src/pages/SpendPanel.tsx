import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import { Link } from '../components/Link.js';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import type { CapsState } from '../lib/live-run/run-state.js';
import { shareOf } from '../lib/live-run/run-summary.js';

// RF-1003, RF-1011, RF-1015, DEC-137: the spend of the run beside the code map: the cost so far
// against the cap of the run as a bar, the tokens against their cap, and the two ways on: the
// per-role table and the estimate (the All agents tab) and the provider calls and logs page.

export interface SpendPanelProps {
  readonly runId: string;
  readonly costMicros: number;
  readonly tokens: number;
  readonly caps: CapsState | undefined;
  readonly onOpenRoles: () => void;
}

function Bar({ share }: { readonly share: number }): JSX.Element {
  return (
    <div
      class="rst-cap-meter"
      role="meter"
      aria-label="Spend against the cap"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={share}
      aria-valuetext={`${String(share)}% of the cap`}
    >
      <div
        class={
          share >= 80 ? 'rst-cap-meter__fill rst-live-meter__fill--warn' : 'rst-cap-meter__fill'
        }
        style={{ inlineSize: `${String(share)}%` }}
      />
    </div>
  );
}

function Figures({ props }: { readonly props: SpendPanelProps }): JSX.Element {
  const { caps, costMicros, tokens } = props;
  if (caps === undefined) {
    return <p class="rst-settings__note">The caps of the run are not known yet.</p>;
  }
  return (
    <>
      <Bar share={shareOf(costMicros, caps.maxCostMicros)} />
      <p class="rst-spend__tokens">
        {tokensLabel(tokens)} of {tokensLabel(caps.maxTokens)} tokens
      </p>
    </>
  );
}

// RF-1003
export function SpendPanel(props: SpendPanelProps): JSX.Element {
  const { caps, costMicros } = props;
  return (
    <section class="rst-card rst-spend" aria-labelledby="rst-spend-title">
      <header class="rst-spend__head">
        <h2 id="rst-spend-title" class="rst-spend__heading">
          Spend for this run
        </h2>
        {caps === undefined ? null : (
          <span class="rst-spend__cap">{`cap ${costLabel(caps.maxCostMicros)}`}</span>
        )}
      </header>
      <p class="rst-spend__cost">{costLabel(costMicros)}</p>
      <Figures props={props} />
      <div class="rst-spend__more">
        <Button variant="ghost" onClick={props.onOpenRoles}>
          Cost per role and estimate
        </Button>
        <Link href={`/runs/${encodeURIComponent(props.runId)}/calls`}>API calls and logs</Link>
      </div>
    </section>
  );
}
