import { parse } from 'yaml';
import { z } from 'zod';
import { holdsDataMarker } from '../../domain/egress/data-block.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  catalogueGroups,
  isArchitectureStyleId,
  type ArchitectureStyle,
  type CatalogueEntry,
} from '../../domain/planning/catalogue.js';

// RF-606, RF-608, DEC-84: one catalogue file, `catalogue/<id>.v<n>.md`. A YAML front matter
// `{ id, group, title, default }` between `---` lines, then the sections `## Rule` (one line),
// `## Why it matters` and `## How to check`; an architecture style adds the bullet lists
// `## Choose it when` and `## Look elsewhere when`. Anything else is refused with RST-1000 rather
// than half read, so `plan` never works from a broken catalogue.

const frontMatterSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  group: z.enum(catalogueGroups),
  title: z.string().trim().min(1).max(80),
  default: z.boolean(),
});

const readmeSchema = z.object({ catalogueVersion: z.number().int().positive() });

const prose = z.string().min(1).max(1000);
const bullets = z.array(z.string().min(1).max(300)).min(2).max(8);

const principleSections = ['Rule', 'Why it matters', 'How to check'] as const;
const styleSections = [...principleSections, 'Choose it when', 'Look elsewhere when'] as const;

const frontMatterPattern = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u;
const bulletPattern = /^- (.+)$/u;

function invalid(name: string, problem: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.configurationInvalid,
    `The catalogue file ${name} ${problem}.`,
    { cause },
  );
}

function splitFrontMatter(name: string, text: string): { header: unknown; body: string } {
  const match = frontMatterPattern.exec(text);
  if (match === null) throw invalid(name, 'has no front matter');
  try {
    const header: unknown = parse(match[1] ?? '');
    return { header, body: match[2] ?? '' };
  } catch (error) {
    throw invalid(name, 'has front matter that is not valid YAML', error);
  }
}

/** The body's `## ` sections by heading; text before the first heading must be blank. */
function sectionsOf(name: string, body: string): Map<string, string> {
  const [preamble, ...parts] = body.split(/^## /mu);
  if ((preamble ?? '').trim() !== '') throw invalid(name, 'has text before its first section');
  const sections = new Map<string, string>();
  for (const part of parts) {
    const heading = part.slice(0, part.indexOf('\n')).trim();
    if (sections.has(heading)) throw invalid(name, `repeats the section ${heading}`);
    sections.set(heading, part.slice(heading.length).trim());
  }
  return sections;
}

function requireSections(name: string, sections: Map<string, string>, wanted: readonly string[]) {
  const found = [...sections.keys()];
  if (found.length !== wanted.length || !wanted.every((heading) => sections.has(heading))) {
    throw invalid(name, `must have exactly the sections ${wanted.join(', ')}`);
  }
}

function proseOf(name: string, sections: Map<string, string>, heading: string): string {
  const parsed = prose.safeParse((sections.get(heading) ?? '').replace(/\s+/gu, ' '));
  if (!parsed.success) throw invalid(name, `has an empty or too long section ${heading}`);
  return parsed.data;
}

function ruleOf(name: string, sections: Map<string, string>): string {
  const rule = sections.get('Rule') ?? '';
  if (rule === '' || rule.includes('\n') || rule.length > 200) {
    throw invalid(name, 'must state its rule on one line of at most 200 characters');
  }
  return rule;
}

function bulletsOf(name: string, sections: Map<string, string>, heading: string): string[] {
  const lines = (sections.get(heading) ?? '').split('\n');
  const items = lines.map((line) => bulletPattern.exec(line)?.[1]?.trim());
  const parsed = bullets.safeParse(items);
  if (!parsed.success) throw invalid(name, `must list two to eight bullets under ${heading}`);
  return parsed.data;
}

function frontMatterOf(name: string, header: unknown): z.infer<typeof frontMatterSchema> {
  const parsed = frontMatterSchema.safeParse(header);
  if (!parsed.success) throw invalid(name, 'has front matter outside its schema', parsed.error);
  if (!name.startsWith(`${parsed.data.id}.v`)) throw invalid(name, 'has an id unlike its name');
  const isStyleGroup = parsed.data.group === 'architecture-styles';
  if (isStyleGroup !== isArchitectureStyleId(parsed.data.id)) {
    throw invalid(name, 'must be one of the six styles exactly when its group is the styles');
  }
  return parsed.data;
}

/** The entry in the text of the catalogue file `name` (RF-606, RF-608). */
// RF-606, RF-608, RF-145
export function parseCatalogueEntry(
  name: string,
  text: string,
): CatalogueEntry | ArchitectureStyle {
  if (holdsDataMarker(text)) throw invalid(name, 'holds a data block marker');
  const { header, body } = splitFrontMatter(name, text);
  const front = frontMatterOf(name, header);
  const sections = sectionsOf(name, body);
  const entry: CatalogueEntry = {
    id: front.id,
    group: front.group,
    title: front.title,
    rule: ruleOf(name, sections),
    why: proseOf(name, sections, 'Why it matters'),
    check: proseOf(name, sections, 'How to check'),
    defaultOn: front.default,
  };
  if (!isArchitectureStyleId(entry.id)) {
    requireSections(name, sections, principleSections);
    return entry;
  }
  requireSections(name, sections, styleSections);
  return {
    ...entry,
    id: entry.id,
    chooseWhen: bulletsOf(name, sections, 'Choose it when'),
    avoidWhen: bulletsOf(name, sections, 'Look elsewhere when'),
  };
}

/** The catalogue version declared in the README's front matter (DEC-84). */
// RF-606
export function parseCatalogueReadme(text: string): number {
  const name = 'readme';
  if (holdsDataMarker(text)) throw invalid(name, 'holds a data block marker');
  const parsed = readmeSchema.safeParse(splitFrontMatter(name, text).header);
  if (!parsed.success) throw invalid(name, 'must declare a whole positive catalogueVersion');
  return parsed.data.catalogueVersion;
}
