import type { PlanContent } from './plan-content.js';
import type { PhaseNote } from './requirement-notes.js';

// RF-601, RF-627, P5-40: a phase is titled from the cards it holds. The planner names the phases
// before it knows which cards land in them, and the gap pass adds cards later, so a name can
// describe other work (a phase "Marks" holding the attendance card). A name that shares no word
// with any card of its phase is replaced by the titles of those cards, and the change is noted
// for checks.md. A name that fits, and a phase with no card, are left as they are.

const MIN_WORD = 4;
const STEM = 4;
const NAMED = 3;

/** The words of a text that count for a match: lower case, four letters or more, cut to a stem. */
function stems(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((word) => word.length >= MIN_WORD).map((w) => w.slice(0, STEM)));
}

function titled(titles: readonly string[]): string {
  const named = titles.slice(0, NAMED);
  const more = titles.length - named.length;
  if (more > 0) return `${named.join(', ')} and ${String(more)} more`;
  const last = named.at(-1) ?? '';
  return named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${last}` : last;
}

/** The plan with every phase whose name fits none of its cards named after them. */
// RF-627
export function titlePhases(content: PlanContent): PlanContent {
  const notes: PhaseNote[] = [];
  const phases = content.phases.map((phase) => {
    const titles = content.tasks.filter((task) => task.phase === phase.number).map((t) => t.title);
    if (titles.length === 0) return phase;
    const name = stems(phase.name);
    if (titles.some((title) => [...stems(title)].some((stem) => name.has(stem)))) return phase;
    const to = titled(titles);
    notes.push({ phase: phase.number, from: phase.name, to });
    return { ...phase, name: to };
  });
  if (notes.length === 0) return content;
  return { ...content, phases, phaseNotes: [...(content.phaseNotes ?? []), ...notes] };
}
