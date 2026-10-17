import type { Area } from './area.js';
import type { ArtefactKind } from './artefact.js';
import type { CodeMap } from './code-map.js';

// RF-260, RF-261, DEC-134, Q-25: the code map marks the areas that hold entry points (a page
// action, an HTTP handler, a scheduled job, a message handler) or pages, forms, views and
// templates. The reader writes `FLOW` and `SCRN` cards only there, so an area of plain libraries
// costs nothing extra. The marks come from what the scan already knows about each file (its
// artefact kinds) and its classes, so the code map file does not change.

/** The files of an area that start behaviour, and those that are a screen. */
export interface AreaSurface {
  readonly entryPoints: readonly string[];
  readonly pages: readonly string[];
}

export interface AreaMarks {
  readonly flows: boolean;
  readonly screens: boolean;
}

type Mapped = Pick<CodeMap, 'files' | 'symbols'>;

/** Files the scan tags as a place where behaviour starts (RF-102). */
const entryKinds: ReadonlySet<ArtefactKind> = new Set(['controller', 'entry-point', 'page']);

/** Views and templates the scan does not tag as pages: user controls, master pages, components. */
const templateExtensions: ReadonlySet<string> = new Set([
  'ascx',
  'master',
  'razor',
  'xaml',
  'erb',
  'ejs',
  'hbs',
  'twig',
  'vue',
  'svelte',
]);

/** A class that runs on a schedule or on a message: a job, a handler, a consumer. */
const handlerClass = /(?:Handler|Job|Consumer|Listener|Subscriber|Worker)$/u;

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function handlerPaths(map: Mapped): ReadonlySet<string> {
  const symbols = map.symbols.filter(
    (symbol) => symbol.kind === 'class' && handlerClass.test(symbol.name),
  );
  return new Set(symbols.map((symbol) => symbol.path));
}

// RF-260, RF-261, Q-25
export function surfaceOf(area: Pick<Area, 'files'>, map: Mapped): AreaSurface {
  const known = new Map(map.files.map((file) => [file.path, file]));
  const handlers = handlerPaths(map);
  const entryPoints: string[] = [];
  const pages: string[] = [];
  for (const path of area.files) {
    const kinds = known.get(path)?.artefactKinds ?? [];
    const isPage = kinds.includes('page') || templateExtensions.has(extensionOf(path));
    if (isPage) pages.push(path);
    if (isPage || handlers.has(path) || kinds.some((kind) => entryKinds.has(kind))) {
      entryPoints.push(path);
    }
  }
  return { entryPoints, pages };
}

/**
 * Whether the area is marked for flows (it has an entry point) and for screens (it has a page); an
 * area marked for neither is read as it always was.
 */
// Q-25
export function marksOf(area: Pick<Area, 'files'>, map: Mapped): AreaMarks {
  const surface = surfaceOf(area, map);
  return { flows: surface.entryPoints.length > 0, screens: surface.pages.length > 0 };
}
