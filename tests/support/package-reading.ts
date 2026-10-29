import { posix } from 'node:path';

// RF-612, RF-640, RF-642, P6-12: reading a hand-off package the way a new agent does, from its
// files alone. Pure helpers over the files by their path (no folder, no server), shared by the
// integration test and the journey so both read the same things.

export type Files = Readonly<Record<string, string>>;

/** The text as the reader sees it: the escaper's backslashes removed. */
function unescaped(text: string | undefined): string {
  return (text ?? '').replaceAll('\\', '');
}

/** The files the README's reading order links, in order (`[label](target)` of its numbered lines). */
export function readingOrderTargets(files: Files): string[] {
  const readme = unescaped(files['README.md']);
  const section = readme.split('## Reading order')[1]?.split('\n## ')[0] ?? '';
  return section
    .split('\n')
    .filter((line) => /^\d+\. /u.test(line))
    .flatMap((line) => {
      const match = /\]\(([^)#]+)(?:#[^)]*)?\)/u.exec(line);
      return match?.[1] === undefined ? [] : [match[1]];
    });
}

/** The headings (`## x`) of a file, without the hashes. */
export function headingsOf(text: string | undefined): string[] {
  return unescaped(text)
    .split('\n')
    .filter((line) => /^#{1,3} /u.test(line))
    .map((line) => line.replace(/^#+ /u, ''));
}

/** Every relative link of every Markdown file that names a file the package does not have. */
export function brokenLinks(files: Files): string[] {
  const broken: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    if (!path.endsWith('.md')) continue;
    for (const match of unescaped(text).matchAll(/\]\(([^)\s]+)\)/gu)) {
      const target = (match[1] ?? '').split('#')[0] ?? '';
      if (target === '' || /^[a-z][a-z0-9+.-]*:/iu.test(target)) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(path), target));
      if (!(resolved in files)) broken.push(`${path} -> ${target}`);
    }
  }
  return broken;
}

/** The difficulty line of every card of `tasks.md`: rating, tier and model, in card order. */
export function cardModels(
  files: Files,
): { id: string; rating: number; tier: string; model: string }[] {
  const cards = unescaped(files['tasks.md']).split(/^## /mu).slice(1);
  return cards.map((card) => {
    const id = card.split('\n')[0] ?? '';
    const found = /^Difficulty: (\d+) \((\w+) tier, model: ([^)]+)\)$/mu.exec(card);
    return { id, rating: Number(found?.[1] ?? 0), tier: found?.[2] ?? '', model: found?.[3] ?? '' };
  });
}

/** The lines of the front matter of a file, or undefined when it has none. */
export function frontMatterOf(text: string | undefined): string[] | undefined {
  const lines = (text ?? '').split('\n');
  if (lines[0] !== '---') return undefined;
  const end = lines.indexOf('---', 1);
  return end < 0 ? undefined : lines.slice(1, end);
}
