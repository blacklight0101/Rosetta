import type { PlanContent } from './plan-content.js';
import type { PhaseNote } from './requirement-notes.js';

// RF-601, RF-627, P5-40: a phase is titled from the cards it holds. The planner names the phases
// before it knows which cards land in them, and the gap pass adds cards later, so a name can
// describe other work (a phase "Marks" holding the attendance card). A name that shares no word
// with any card of its phase is replaced by the titles of those cards, and the change is noted
// for checks.md. A name that fits, and a phase with no card, are left as they are. Words count
// when they are two letters or more and not filler; a word matches another when one starts with
// the other (Pay, Payments; Order, Orders), and two neighbouring words also count joined (Set up,
// Setup).

const MIN_WORD = 2;
const MIN_STEM = 3;
const NAMED = 3;
const filler = new Set([
  ...['and', 'the', 'for', 'with', 'from', 'into', 'data', 'phase', 'stage', 'part', 'step'],
  ...['new', 'all', 'our', 'its', 'are', 'any', 'one', 'two'],
]);

function words(text: string): string[] {
  const found = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return found.filter((word) => word.length >= MIN_WORD && !filler.has(word));
}

/** The words of a text, plus each pair of neighbouring words written together. */
function terms(text: string): string[] {
  const single = words(text);
  const pairs = single.slice(1).map((word, at) => `${single[at] ?? ''}${word}`);
  return [...single, ...pairs];
}

function alike(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short === long || (short.length >= MIN_STEM && long.startsWith(short));
}

function titled(titles: readonly string[]): string {
  const named = titles.slice(0, NAMED);
  const more = titles.length - named.length;
  if (more > 0) return `${named.join(', ')} and ${String(more)} more`;
  const last = named.at(-1) ?? '';
  return named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${last}` : last;
}

function fits(name: string, titles: readonly string[]): boolean {
  const own = terms(name);
  return titles.some((title) => terms(title).some((term) => own.some((mine) => alike(mine, term))));
}

/** The plan with every phase whose name fits none of its cards named after them. */
// RF-627
export function titlePhases(content: PlanContent): PlanContent {
  const notes: PhaseNote[] = [];
  const phases = content.phases.map((phase) => {
    const titles = content.tasks.filter((task) => task.phase === phase.number).map((t) => t.title);
    if (titles.length === 0 || fits(phase.name, titles)) return phase;
    const to = titled(titles);
    notes.push({ phase: phase.number, from: phase.name, to });
    return { ...phase, name: to };
  });
  if (notes.length === 0) return content;
  return { ...content, phases, phaseNotes: [...(content.phaseNotes ?? []), ...notes] };
}
