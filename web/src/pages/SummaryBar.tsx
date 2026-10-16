import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import { dollars, pricedTotal, unpricedRoles } from '../lib/estimate-math.js';
import { chosenOf, plural } from './area-selection.js';
import type { StartForm } from './use-start-form.js';

// RF-1018, P1-172, design-system.md section 14 (Start run): the bar that stays at the bottom of the
// window while the page scrolls: the areas and files chosen, the estimate, and Start with the
// reason it cannot be pressed.

function estimateText(form: StartForm, chosenAreas: number): string | undefined {
  const { estimate } = form.choice;
  if (chosenAreas === 0) return undefined;
  if (estimate.status === 'loading') return 'Estimating';
  if (estimate.status !== 'ready') return undefined;
  const more = unpricedRoles(estimate.estimate).length > 0 ? ' or more' : '';
  return `Likely ${dollars(pricedTotal(estimate.estimate, 'likely'))}${more}`;
}

function Totals({ form }: { readonly form: StartForm }): JSX.Element | null {
  if (form.stage !== 'understand') return null;
  const { areas } = form.choice;
  const chosen = chosenOf(areas);
  const estimate = estimateText(form, chosen.areas);
  const counts = `${String(chosen.areas)} of ${plural(areas.length, 'area')}`;
  return (
    <p class="rst-start__bar-totals" data-testid="run-summary">
      {`${counts} · ${plural(chosen.files, 'file')}`}
      {estimate === undefined ? '' : ` · ${estimate}`}
    </p>
  );
}

// RF-1018
export function SummaryBar({ form }: { readonly form: StartForm }): JSX.Element {
  const { actions, gate, choice, stage } = form;
  const waiting = actions.notice?.kind === 'queued' || actions.notice?.kind === 'started';
  const canEstimate = stage === 'understand' || choice.estimate.status === 'none';
  return (
    <section class="rst-start__bar" aria-label="Run summary">
      <div class="rst-start__bar-text">
        <Totals form={form} />
        {gate.reason === undefined ? null : (
          <p class="rst-settings__note" data-testid="start-reason">
            {gate.reason}
          </p>
        )}
      </div>
      <div class="rst-start__actions">
        {canEstimate ? <Button onClick={choice.reestimate}>Re-estimate</Button> : null}
        {waiting ? null : (
          <Button
            variant="primary"
            busy={actions.busy}
            {...(gate.reason === undefined ? {} : { disabledReason: gate.reason })}
            onClick={actions.submit}
          >
            {gate.label}
          </Button>
        )}
      </div>
    </section>
  );
}
