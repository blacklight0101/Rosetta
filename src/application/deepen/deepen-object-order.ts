import type { ObjectCoverage } from '../../domain/cards/database-objects.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';
import type { ReaderTask } from '../understand/reader-tasks.js';

// P5-36, RF-209: the order of a Deepen round's reads when database objects have no card. The objects
// a card does not state (no card, or named only) are read before every other re-read: a task of
// their own per script, told the lines of each object; a task that already reads the script (a
// gap or a failed area) moves to the front instead of a second one being added.

type Draft = Omit<ReaderTask, 'agentTaskId'>;
type ObjectMap = Pick<CodeMap, 'areas' | 'files'>;

function objectTask(path: string, objects: readonly ObjectCoverage[], map: ObjectMap): Draft {
  const known = map.areas.find((area) => area.files.includes(path));
  const tokens = map.files.find((file) => file.path === path)?.estimatedTokens ?? 0;
  return {
    area: {
      name: known?.name ?? path,
      files: [path],
      estimatedTokens: tokens,
      mapLevel: known?.mapLevel ?? 'coarse',
      origin: known?.origin ?? 'folder',
    },
    unreadRanges: [
      {
        path,
        ranges: objects.map(({ startLine, endLine }) => ({ startLine, endLine })),
        objects: true,
      },
    ],
  };
}

// P5-36
export function readObjectsFirst(
  tasks: readonly Draft[],
  objects: readonly ObjectCoverage[],
  map: ObjectMap,
): readonly Draft[] {
  if (objects.length === 0) return tasks;
  const paths = [...new Set(objects.map((object) => object.path))];
  const reading = (task: Draft): boolean => task.area.files.some((file) => paths.includes(file));
  const read = new Set(tasks.flatMap((task) => task.area.files));
  const added = paths
    .filter((path) => !read.has(path))
    .map((path) =>
      objectTask(
        path,
        objects.filter((object) => object.path === path),
        map,
      ),
    );
  return [...added, ...tasks.filter(reading), ...tasks.filter((task) => !reading(task))];
}
