import type { JSX } from 'preact';
import { Field } from '../components/Field.js';
import { LimitSetting } from './LimitSetting.js';
import { RoleCapNotice, type RoleCaps } from './RoleCapNotice.js';
import type { SectionProps } from './settings-section.js';
import { confirmCeiling, ranges, runCostOutOfRange, templateDefaults } from './setting-limits.js';

// RF-002, RF-422, RF-425, DEC-116, DEC-117: the run caps, the scan limits and the ignore rules.
// Each number is a number field with a slider bounded by its DEC-117 range (card P2-15). Dollars
// are typed as dollars and saved as micro-dollars; the server refuses a value outside its range and
// names the field.

function CapNumbers({ editor, errorFor }: SectionProps): JSX.Element {
  const { draft, change } = editor;
  return (
    <div class="rst-settings__grid">
      <LimitSetting
        id="cap-run-cost"
        label="Run cost cap (USD)"
        path="budget.run.maxCostMicros"
        errorFor={errorFor}
        range={ranges.runCost}
        unit="dollars"
        defaultValue={templateDefaults.runCost}
        value={draft.runCost}
        onInput={(runCost) => {
          change({ runCost });
        }}
      />
      <LimitSetting
        id="cap-run-tokens"
        label="Run token cap"
        path="budget.run.maxTokens"
        errorFor={errorFor}
        range={ranges.runTokens}
        unit="count"
        defaultValue={templateDefaults.runTokens}
        value={draft.runTokens}
        onInput={(runTokens) => {
          change({ runTokens });
        }}
      />
      <LimitSetting
        id="cap-confirm"
        label="Ask before a run estimated above (USD)"
        path="budget.confirmAboveCostMicros"
        help="The start page asks you to confirm a run whose estimate is higher."
        errorFor={errorFor}
        range={ranges.confirmAbove}
        max={confirmCeiling(draft.runCost)}
        hideHint={runCostOutOfRange(draft.runCost)}
        unit="dollars"
        defaultValue={templateDefaults.confirmAbove}
        value={draft.confirmAbove}
        onInput={(confirmAbove) => {
          change({ confirmAbove });
        }}
      />
    </div>
  );
}

// RF-422, RF-423 (the role caps as a notice, P2-26)
export function CapSettings(props: SectionProps & { readonly roles: RoleCaps }): JSX.Element {
  const { editor, errorFor, roles } = props;
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="caps">
      <h2 id="caps" class="rst-settings__heading">
        Caps
      </h2>
      <p class="rst-settings__note">
        A run stops cleanly when it reaches either cap. Amounts are in US dollars.
      </p>
      <CapNumbers {...props} />
      <RoleCapNotice
        roles={roles}
        runCost={editor.draft.runCost}
        runTokens={editor.draft.runTokens}
      />
      <Field
        kind="checkbox"
        id="cap-allow-unpriced"
        label="Allow models missing from the price table"
        checked={editor.draft.allowUnpriced}
        help="Lets a run use a non-local model that has no price, with your own key only. Its cost is shown as unknown and only the token cap applies."
        error={errorFor('budget.allowUnpriced')}
        announce={false}
        onChange={(allowUnpriced) => {
          editor.change({ allowUnpriced });
        }}
      />
    </section>
  );
}

function ScanNumbers({ editor, errorFor }: SectionProps): JSX.Element {
  const { draft, change } = editor;
  return (
    <div class="rst-settings__grid">
      <LimitSetting
        id="scan-max-file-bytes"
        label="Largest file to read (bytes)"
        path="scan.maxFileBytes"
        help="Larger files are listed as skipped."
        errorFor={errorFor}
        range={ranges.maxFileBytes}
        unit="count"
        defaultValue={templateDefaults.maxFileBytes}
        value={draft.maxFileBytes}
        onInput={(maxFileBytes) => {
          change({ maxFileBytes });
        }}
      />
      <LimitSetting
        id="scan-area-budget"
        label="Area token budget"
        path="scan.areaTokenBudget"
        help="How much code one area holds before it is split."
        errorFor={errorFor}
        range={ranges.areaTokenBudget}
        unit="count"
        defaultValue={templateDefaults.areaTokenBudget}
        value={draft.areaTokenBudget}
        onInput={(areaTokenBudget) => {
          change({ areaTokenBudget });
        }}
      />
      <LimitSetting
        id="scan-excerpt-lines"
        label="Excerpt length (lines)"
        path="scan.excerptMaxLines"
        help="The most lines of one file an agent may be shown at a time."
        errorFor={errorFor}
        range={ranges.excerptMaxLines}
        unit="count"
        defaultValue={templateDefaults.excerptMaxLines}
        value={draft.excerptMaxLines}
        onInput={(excerptMaxLines) => {
          change({ excerptMaxLines });
        }}
      />
    </div>
  );
}

function ParallelReaders({ editor, errorFor }: SectionProps): JSX.Element {
  return (
    <div class="rst-settings__grid">
      <LimitSetting
        id="agents-parallelism"
        label="Parallel readers"
        path="agents.parallelism"
        help="Reader tasks that run at the same time."
        errorFor={errorFor}
        range={ranges.parallelism}
        unit="count"
        defaultValue={templateDefaults.parallelism}
        value={editor.draft.parallelism}
        onInput={(parallelism) => {
          editor.change({ parallelism });
        }}
      />
    </div>
  );
}

// RF-100, RF-104, RF-144
export function ScanSettings(props: SectionProps): JSX.Element {
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="scan">
      <h2 id="scan" class="rst-settings__heading">
        Scan and readers
      </h2>
      <ScanNumbers {...props} />
      <ParallelReaders {...props} />
    </section>
  );
}

// RF-140
export function IgnoreRules({ editor, errorFor }: SectionProps): JSX.Element {
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="ignore">
      <h2 id="ignore" class="rst-settings__heading">
        Ignore rules
      </h2>
      <Field
        kind="textarea"
        id="scan-ignore-rules"
        label="Ignore patterns"
        rows={12}
        value={editor.draft.ignoreRules}
        help="One pattern per line, in gitignore syntax. A file that matches is never read and never sent to a provider."
        error={errorFor('scan.ignoreRules')}
        announce={false}
        onInput={(ignoreRules) => {
          editor.change({ ignoreRules });
        }}
      />
    </section>
  );
}
