import type { JSX } from 'preact';
import type { CostLine, ProjectCost, UsageTotals } from '../api/cost-schemas.js';
import { useRouteParams } from '../app/route-params.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Link } from '../components/Link.js';
import { tokensLabel } from '../lib/live-run/format.js';
import { totalCostText } from '../lib/cost-text.js';
import { secondsText } from './admin-format.js';
import { CostTable, type CostRow } from './CostTable.js';
import { useProjectCost } from './use-project-cost.js';

// RF-428, RF-1010, RF-1105, DEC-49: `/projects/:projectId/cost`, every model call of every run on
// the project from the cost ledger: the totals and the breakdown by run, stage, role, provider and
// model. The user's provider tests belong to no project and no run: they are listed after the
// breakdown, outside the project totals, as the part of "Your total" no project explains. Another user's project answers
// 404 like an unknown one, and the page shows that error and no table.

function Totals({ totals }: { readonly totals: UsageTotals }): JSX.Element {
  const figures: readonly [string, string][] = [
    ['Calls', tokensLabel(totals.calls)],
    ['Input tokens', tokensLabel(totals.inputTokens)],
    ['Output tokens', tokensLabel(totals.outputTokens)],
    ['Cached input tokens', tokensLabel(totals.cachedInputTokens)],
    ['Cost', totalCostText(totals)],
  ];
  return (
    <section class="rst-p136-totals" aria-label="Project totals">
      <dl class="rst-p136-figures">
        {figures.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const plainRows = (lines: readonly CostLine[]): CostRow[] =>
  lines.map((line) => ({ ...line, name: line.key }));

function runRows(cost: ProjectCost): CostRow[] {
  return cost.byRun.map((line) => ({
    ...line,
    name:
      line.runId === null ? (
        'Provider tests'
      ) : (
        <>
          <Link href={`/runs/${encodeURIComponent(line.runId)}`} class="rst-mono">
            {line.runId}
          </Link>
          <div class="rst-table__sub">{`${secondsText(line.firstAt)} UTC`}</div>
        </>
      ),
  }));
}

function modelRows(cost: ProjectCost): CostRow[] {
  return cost.byModel.map((line) => ({
    ...line,
    name: (
      <>
        <span class="rst-mono">{line.model}</span>
        <div class="rst-table__sub">{line.provider}</div>
      </>
    ),
  }));
}

/** RF-407: the user's provider tests belong to no project and no run; they count in "Your total". */
function ProviderTests({ line }: { readonly line: CostLine }): JSX.Element {
  return (
    <div>
      <CostTable
        caption="Provider tests"
        firstColumn="Calls of"
        rows={[{ ...line, name: 'Provider tests' }]}
      />
      <p class="rst-settings__note">
        The Test button on the settings page makes these calls. They belong to no project and no
        run, so they are not part of this project's totals; they are part of your total in the
        header.
      </p>
    </div>
  );
}

function Breakdown({ cost }: { readonly cost: ProjectCost }): JSX.Element {
  return (
    <>
      <Totals totals={cost.totals} />
      <CostTable caption="By run" firstColumn="Run" rows={runRows(cost)} />
      <CostTable caption="By stage" firstColumn="Stage" rows={plainRows(cost.byStage)} />
      <CostTable caption="By role" firstColumn="Role" rows={plainRows(cost.byRole)} />
      <CostTable caption="By provider" firstColumn="Provider" rows={plainRows(cost.byProvider)} />
      <CostTable caption="By model" firstColumn="Model" rows={modelRows(cost)} />
      {cost.providerTests === null ? null : <ProviderTests line={cost.providerTests} />}
    </>
  );
}

// RF-428
export function ProjectCostPage(): JSX.Element {
  const state = useProjectCost(useRouteParams()['projectId'] ?? '');
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the project cost
      </p>
    );
  }
  const title = <h1 class="rst-page__title">Project cost</h1>;
  if (state.status === 'failed') {
    return (
      <div class="rst-p136-cost">
        {title}
        <ErrorBanner error={state.error} />
      </div>
    );
  }
  return (
    <div class="rst-p136-cost">
      <div>
        {title}
        <p class="rst-settings__lead">
          <span class="rst-mono">{state.cost.project.name}</span>
        </p>
        <p class="rst-settings__note">
          Every model call of every run on this project, from the cost ledger. Each line keeps the
          cost computed when its calls were made and the price table it used; local models cost
          nothing.
        </p>
      </div>
      <Breakdown cost={state.cost} />
    </div>
  );
}
