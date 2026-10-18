import type { JSX } from 'preact';
import { groupNotCovered, type CoverageGroup } from '../lib/group-not-covered.js';
import { RenderedText } from '../components/RenderedText.js';

// RF-264, P1-173: what the run could not cover, grouped by reason with a count per group. A group of
// more than FOLD_AFTER lines is folded behind a native disclosure (keyboard operable, no script) that
// lists its areas. Lines are repository and model text, shown as text. Styles are under `.rst-p168-`.

const FOLD_AFTER = 5;

function Lines({ lines }: { readonly lines: readonly string[] }): JSX.Element {
  return (
    <ul class="rst-p168-statements">
      {lines.map((line, index) => (
        <li key={`${String(index)}-${line}`}>
          <RenderedText text={line} />
        </li>
      ))}
    </ul>
  );
}

function Group({ group }: { readonly group: CoverageGroup }): JSX.Element {
  const title = `${group.title} (${String(group.lines.length)})`;
  if (group.lines.length > FOLD_AFTER) {
    return (
      <details class="rst-p168-group">
        <summary class="rst-p168-group__title">{title}</summary>
        <Lines lines={group.lines} />
      </details>
    );
  }
  return (
    <div class="rst-p168-group">
      <h4 class="rst-p168-group__title">{title}</h4>
      <Lines lines={group.lines} />
    </div>
  );
}

// RF-264
export function NotCovered({ lines }: { readonly lines: readonly string[] }): JSX.Element {
  return (
    <section class="rst-p168-section" aria-labelledby="overview-not-covered">
      <h3 class="rst-p168-section__title" id="overview-not-covered">
        What was not covered
      </h3>
      {lines.length === 0 ? (
        <p>Every area of the run gave at least one card.</p>
      ) : (
        groupNotCovered(lines).map((group) => <Group key={group.title} group={group} />)
      )}
    </section>
  );
}
