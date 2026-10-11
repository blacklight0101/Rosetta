import { baseName, extensionOf, stemOf } from './path-parts.js';
import type { ArtefactKind } from './scan-types.js';

// RF-102: the rule table that tags a file with its artefact kinds. Rules look at the file name
// only (no parsing), so one table serves every stack; a new stack adds names to the sets.

interface NameFacts {
  /** Lower-case file name. */
  readonly name: string;
  readonly extension: string;
  /** The name without its last extension. */
  readonly stem: string;
}

interface Rule {
  readonly kind: ArtefactKind;
  readonly applies: (file: NameFacts) => boolean;
}

function setOf(...names: readonly string[]): ReadonlySet<string> {
  return new Set(names);
}

const pageExtensions = setOf('aspx', 'asp', 'jsp', 'jspx', 'php', 'phtml', 'cshtml', 'vbhtml');
const sourceExtensions = setOf('cs', 'vb', 'java', 'kt', 'php', 'js', 'ts', 'py', 'rb');
const entrySourceExtensions = setOf('cs', 'vb', 'fs', 'c', 'cpp', 'go', 'java', 'kt', 'py', 'rs');
const entryNames = setOf(
  'global.asax',
  'global.asax.cs',
  'global.asax.vb',
  'index.php',
  'manage.py',
  '__main__.py',
);
const configurationExtensions = setOf('config', 'properties', 'ini');
const manifestNames = setOf(
  'packages.config',
  'pom.xml',
  'composer.json',
  'package.json',
  'requirements.txt',
  'build.gradle',
  'build.gradle.kts',
  'go.mod',
  'cargo.toml',
  'pyproject.toml',
  'gemfile',
);
const manifestExtensions = setOf('csproj', 'vbproj', 'fsproj');

const rules: readonly Rule[] = [
  { kind: 'page', applies: (file) => pageExtensions.has(file.extension) },
  {
    kind: 'controller',
    applies: (file) => file.stem.endsWith('controller') && sourceExtensions.has(file.extension),
  },
  {
    kind: 'entry-point',
    applies: (file) =>
      entryNames.has(file.name) ||
      ((file.stem === 'program' || file.stem === 'main') &&
        entrySourceExtensions.has(file.extension)),
  },
  {
    kind: 'configuration',
    applies: (file) =>
      (configurationExtensions.has(file.extension) && !manifestNames.has(file.name)) ||
      (file.name.startsWith('appsettings.') && file.extension === 'json'),
  },
  { kind: 'database-script', applies: (file) => file.extension === 'sql' },
  {
    kind: 'manifest',
    applies: (file) => manifestNames.has(file.name) || manifestExtensions.has(file.extension),
  },
];

/** The kinds of a repository-relative path, sorted; empty for a file no rule knows. */
export function artefactKindsOf(path: string): readonly ArtefactKind[] {
  const name = baseName(path).toLowerCase();
  const facts: NameFacts = { name, extension: extensionOf(name), stem: stemOf(name) };
  return rules
    .filter((rule) => rule.applies(facts))
    .map((rule) => rule.kind)
    .sort();
}
