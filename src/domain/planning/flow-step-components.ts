// RF-625, ADR-013: the component of the target architecture a legacy flow step lives in when the
// planner did not place it, decided by code from the files the step cites. Two deterministic
// tests, in this order: (1) the step cites a file in a folder where a step the planner did place
// cites a file, and all such steps agree on one component; (2) the words of the cited paths name
// one component more than any other, by its name and its responsibility. A tie or a weak match
// maps nothing, so a step is never given a component by a guess.

export interface ComponentText {
  readonly name: string;
  readonly responsibility: string;
}

/** A step of a flow: the files it cites and the component the planner placed it in, or null. */
export interface StepEvidence {
  readonly files: readonly string[];
  readonly component: string | null;
}

/** The words of a path that carry meaning: no extension, no generic folder, no short word. */
const generic = new Set([
  ...['src', 'source', 'main', 'app', 'lib', 'libs', 'index', 'core', 'common', 'util', 'utils'],
  ...['cs', 'ts', 'js', 'java', 'py', 'cshtml', 'razor', 'vb', 'php', 'rb', 'go', 'kt', 'tsx'],
  ...['the', 'and', 'for', 'class', 'file', 'impl', 'base', 'default', 'test', 'tests'],
]);

function stem(word: string): string {
  return word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
}

function wordsOf(text: string): string[] {
  const spaced = text
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2');
  return spaced
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .map(stem)
    .filter((word) => word.length >= 3 && !generic.has(word));
}

function folderOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

function agreed(names: Iterable<string>): string | null {
  const set = new Set(names);
  const [only] = set;
  return set.size === 1 && only !== undefined ? only : null;
}

function byFolder(step: StepEvidence, placed: readonly StepEvidence[]): string | null {
  const folders = new Set(step.files.map(folderOf).filter((folder) => folder !== ''));
  const names = placed.flatMap((other) =>
    other.component !== null && other.files.some((file) => folders.has(folderOf(file)))
      ? [other.component]
      : [],
  );
  return agreed(names);
}

interface Match {
  readonly name: string;
  readonly words: number;
  readonly score: number;
}

function match(files: readonly string[], component: ComponentText): Match {
  const fromPaths = new Set(files.flatMap(wordsOf));
  const named = new Set(wordsOf(component.name));
  const described = new Set(wordsOf(component.responsibility));
  let score = 0;
  let words = 0;
  let inName = false;
  for (const word of fromPaths) {
    if (named.has(word)) {
      score += 2;
      words += 1;
      inName = true;
    } else if (described.has(word)) {
      score += 1;
      words += 1;
    }
  }
  return { name: component.name, words: inName ? words : 0, score };
}

function byWords(step: StepEvidence, components: readonly ComponentText[]): string | null {
  const matches = components.map((component) => match(step.files, component));
  const strong = matches.filter((each) => each.words >= 2);
  const top = Math.max(0, ...strong.map((each) => each.score));
  return agreed(strong.filter((each) => each.score === top).map((each) => each.name));
}

/** The component for a step the planner left unplaced; null when the code cannot tell. */
// RF-625
export function inferComponent(
  step: StepEvidence,
  placed: readonly StepEvidence[],
  components: readonly ComponentText[],
): string | null {
  if (step.files.length === 0) return null;
  return byFolder(step, placed) ?? byWords(step, components);
}
