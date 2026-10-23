import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import { Link } from '../components/Link.js';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import { capTokensNote } from '../lib/live-run/cap-tokens.js';
import type { CapsState } from '../lib/live-run/run-state.js';
import { shareOf } from '../lib/live-run/run-summary.js';

// RF-1003, RF-1011, RF-1015, DEC-137: the spend of the run beside the code map: the cost so far
// against the cap of the run as a bar, the tokens against their cap, and the two ways on: the
// per-role table and the estimate (the All agents tab) and the provider calls and logs page.

export interface SpendPanelProps {
  readonly runId: string;
  readonly costMicros: number;
  /** The raw tokens of the run: input (cached included) plus output. */
  readonly tokens: number;
  /** P5-16: the tokens that count toward the cap (cached input counts a tenth); `tokens` when absent. */
  readonly capTokens?: number;
  readonly caps: CapsState | undefined;
  readonly onOpenRoles: () => void;
}

interface BarProps {
  readonly share: number;
  /** What the bar measures, as the meter is named for a screen reader. */
  readonly name: string;
  readonly caption: string;
}

function Bar({ share, name, caption }: BarProps): JSX.Element {
  return (
    <>
      <p class="rst-spend__caption">{caption}</p>
      <div
        class="rst-cap-meter"
        role="meter"
        aria-label={name}
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
    </>
  );
}

function Figures({ props }: { readonly props: SpendPanelProps }): JSX.Element {
  const { caps, costMicros, tokens } = props;
  const toward = props.capTokens ?? tokens;
  if (caps === undefined) {
    return <p class="rst-settings__note">The caps of the run are not known yet.</p>;
  }
  // A model that costs nothing leaves the cost bar empty however much it reads: the bar then shows
  // the tokens, the other cap of the run (RF-1003).
  const freeButUsed = costMicros === 0 && tokens > 0;
  return (
    <>
      {freeButUsed ? (
        <Bar
          share={shareOf(toward, caps.maxTokens)}
          name="Tokens against the cap"
          caption="No cost so far. The bar shows the tokens against their cap."
        />
      ) : (
        <Bar
          share={shareOf(costMicros, caps.maxCostMicros)}
          name="Spend against the cap"
          caption="Cost against the cap"
        />
      )}
      <p class="rst-spend__tokens">
        {capTokensNote({ raw: tokens, toward }, caps.maxTokens, tokensLabel) ??
          `${tokensLabel(tokens)} of ${tokensLabel(caps.maxTokens)} tokens`}
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
        <Button variant="link" onClick={props.onOpenRoles}>
          Cost per role and estimate
        </Button>
        <Link href={`/runs/${encodeURIComponent(props.runId)}/calls`}>API calls and logs</Link>
      </div>
    </section>
  );
}
