import type { JSX } from 'preact';
import type { Catalogue, CatalogueEntry } from '../api/plan-schemas.js';
import { Field } from '../components/Field.js';
import { togglePrinciple } from '../lib/plan-setup/choices.js';
import type { Draft } from '../lib/plan-setup/draft.js';
import { GROUP_NAMES, STYLE_GROUP } from '../lib/plan-setup/steps.js';
import { PlanStepCard } from './PlanStepCard.js';

// RF-605, RF-606, design-system.md section 14 (Plan setup): the principles of the catalogue by
// group, each with its one-line rule; the ones a new brief switches on are marked (Recommended).

export interface StepProps {
  readonly draft: Draft;
  readonly catalogue: Catalogue;
  readonly change: (next: Draft) => void;
  readonly problems: Readonly<Record<string, string>>;
}

const principlesOf = (catalogue: Catalogue): readonly CatalogueEntry[] =>
  catalogue.entries.filter((entry) => entry.group !== STYLE_GROUP);

function groupsOf(
  entries: readonly CatalogueEntry[],
): readonly (readonly [string, CatalogueEntry[]])[] {
  const groups = new Map<string, CatalogueEntry[]>();
  for (const entry of entries) groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
  return [...groups];
}

// RF-606
export function PlanPrinciplesStep(props: StepProps): JSX.Element {
  const { draft, catalogue, change } = props;
  const entries = principlesOf(catalogue);
  const on = entries.filter((entry) => entry.defaultOn).length;
  return (
    <PlanStepCard
      step="principles"
      defaultText={`Default: the ${String(on)} recommended principles are on.`}
    >
      {groupsOf(entries).map(([group, members]) => (
        <fieldset key={group} class="rst-plan-group">
          <legend>{GROUP_NAMES[group] ?? group}</legend>
          {members.map((entry) => (
            <Field
              key={entry.id}
              kind="checkbox"
              id={`principle-${entry.id}`}
              label={entry.defaultOn ? `${entry.title} (Recommended)` : entry.title}
              help={entry.rule}
              checked={draft.principles.includes(entry.id)}
              onChange={(checked) => {
                change(togglePrinciple(draft, catalogue, entry.id, checked));
              }}
            />
          ))}
        </fieldset>
      ))}
      <p class="rst-plan-note">{`Catalogue ${String(catalogue.version)}. Its curriculum follows the Master en Desarrollo con IA (BIG School); entries are written by Rosetta.`}</p>
    </PlanStepCard>
  );
}
