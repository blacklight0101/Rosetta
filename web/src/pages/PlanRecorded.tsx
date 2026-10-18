import type { JSX } from 'preact';
import type { Catalogue } from '../api/plan-schemas.js';
import type { Draft } from '../lib/plan-setup/draft.js';
import { recordedLines } from '../lib/plan-setup/recorded.js';

// RF-605, design-system.md section 14 (Plan setup): "What I recorded", one line for each part of
// the brief; a line still on its default says so. Editing is going back to the step above.

export interface PlanRecordedProps {
  readonly draft: Draft;
  readonly catalogue: Catalogue;
}

// RF-605
export function PlanRecorded({ draft, catalogue }: PlanRecordedProps): JSX.Element {
  return (
    <section class="rst-plan-card" aria-labelledby="plan-recorded-title">
      <h2 id="plan-recorded-title" class="rst-plan-card__title">
        What I recorded
      </h2>
      <dl class="rst-plan-recorded">
        {recordedLines(draft, catalogue).map((line) => (
          <div key={line.key}>
            <dt>{line.key}</dt>
            <dd>
              {line.value}
              {line.isDefault ? <span class="rst-plan-default-tag"> (default)</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
