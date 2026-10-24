import { planId, type PlanContent, type PlanTask } from './plan-content.js';
import type { ModelTable } from './data-model.js';
import { isMigrationCard } from './plan-coverage.js';
import type { PlanningBrief } from './planning-brief.js';

// P5-42, RF-610, RF-623, DEC-76: the fixed cards every plan carries, written by code and never by the
// planner. Neither recorded plan of the recall benchmark had a card for the scaffolding, the data
// access, the harness that runs the approval tests, the data migration or the cut-over, so the
// feature cards waited on nothing. The skeleton and the data-access cards come first and every other
// card waits for them; the harness comes next; the data migration and the cut-over come last. The
// cut-over follows the migration strategy of the brief. No card names a stack: they say "the chosen
// stack", whatever it is, and the stack-specific work is left to the builder.

type Strategy = PlanningBrief['migration'];

const titles = {
  skeleton: 'Set up the solution skeleton and continuous integration in the chosen stack',
  access: 'Build the data-access layer on the chosen database',
  harness: 'Build the approval-test harness that runs the legacy behaviour',
  migration: 'Migrate the legacy data into the target tables with a row-count check',
  cutOver: 'Cut over from the legacy system to the new system',
} as const;

const fixedTitles: ReadonlySet<string> = new Set(Object.values(titles));

/** ADR-013: planner output is untrusted, so a planner card that takes a reserved title is renamed. */
function unreserved(task: PlanTask): PlanTask {
  return fixedTitles.has(task.title) ? { ...task, title: `${task.title} (planner card)` } : task;
}

type CardText = Pick<
  PlanTask,
  'title' | 'invariant' | 'acceptanceCriteria' | 'probes' | 'riskClass'
>;

const skeleton: CardText = {
  title: titles.skeleton,
  invariant:
    'The skeleton builds and its checks run in continuous integration on every change, and a failing check blocks the merge.',
  riskClass: 'none',
  acceptanceCriteria: [
    'Given an empty checkout, when the build and the tests run in continuous integration, then the build succeeds and the one placeholder test passes.',
    'Given a change that breaks a test, when continuous integration runs, then the run fails and the change cannot be merged.',
    'Given the layers of the chosen architecture style, when the skeleton is built, then each layer has its own place and a layer that reaches into one it may not use fails the structure check.',
  ],
  probes: [],
};

const access: CardText = {
  title: titles.access,
  invariant:
    'Every read and write of the target tables goes through the data-access layer, with values passed as parameters and never joined into a statement.',
  riskClass: 'data loss',
  acceptanceCriteria: [
    'Given the tables of the migrations card, when the layer writes a row and reads it back, then every column comes back with the value that was written.',
    'Given a value that holds quote characters or statement text, when the layer stores it, then it is stored as plain data and no other row changes.',
    'Given a write that fails halfway, when the layer reports the error, then none of the write is kept.',
  ],
  probes: [
    'A name made of a quote, a statement to delete rows and a comment marker is stored => the row holds that text and every other row is unchanged.',
    'A write of two rows where the second one breaks a constraint => neither row is kept.',
    'The database is not reachable => the layer reports a connection error and returns no partial result.',
  ],
};

const harness: CardText = {
  title: titles.harness,
  invariant:
    'The harness runs one input against the legacy behaviour and the new one and reports every difference with the input that caused it.',
  riskClass: 'none',
  acceptanceCriteria: [
    'Given an approval test pinned on the legacy behaviour, when the harness runs the same input on the legacy system and on the new one, then it passes only when both outputs are equal.',
    'Given an input whose outputs differ, when the harness runs, then the run fails and names the input and both outputs.',
    'Given the same inputs run twice, when the harness compares, then the result is the same both times.',
  ],
  probes: [],
};

function migrationText(tables: readonly ModelTable[]): CardText {
  const copied = tables.filter((table) => table.sources.length > 0);
  const perTable = copied.map(
    (table) =>
      `Given the legacy rows of ${table.sources.join(', ')} holding N rows, when the data migration runs, then the target table ${table.name} holds N rows.`,
  );
  const general =
    copied.length === 0
      ? 'Given the legacy tables named in the data model, when the data migration runs, then each target table holds as many rows as its legacy table.'
      : 'Given a target table whose row count differs from its legacy table, when the data migration finishes, then it fails and names the table and both counts.';
  return {
    title: titles.migration,
    invariant:
      'Every legacy table reaches its target table once, with no row lost or duplicated, and the row counts of both sides are compared before the data migration is accepted.',
    riskClass: 'data loss',
    acceptanceCriteria: [
      ...perTable,
      general,
      'Given a data migration that already ran, when it runs again, then no row is added or changed.',
    ],
    probes: [
      'Run the data migration on a legacy copy with an empty table => the target table is empty and the row-count check passes.',
      'Delete one row of the target after the run and compare counts => the row-count check fails and names the table.',
      'Run it twice => the second run changes no row.',
      'A legacy value that does not fit its target column => the run stops and names the table, the column and the row, and copies nothing cut short.',
    ],
  };
}

const cutOverTexts: Readonly<Record<Strategy, CardText>> = {
  'strangler-fig': {
    title: titles.cutOver,
    invariant:
      'Each part of the legacy system goes live on the new system through the routing step before the next part starts, and the legacy system is switched off only after the last part.',
    riskClass: 'data loss',
    acceptanceCriteria: [
      'Given the routing layer between the two systems, when a request for a part that went live arrives, then the routing step sends it to the new system.',
      'Given a part that is not live yet, when a request for it arrives, then the routing step sends it to the legacy system.',
      'Given a part that went live and failed its checks, when the routing rule is reverted, then requests for the part reach the legacy system again.',
      'Given the last part is live, when the legacy system is switched off, then no request is routed to it.',
    ],
    probes: [
      'A request for a part that is live => it is answered by the new system.',
      'A request for a part not yet live => it is answered by the legacy system.',
      'The routing rule of a part is reverted => the next request for the part is answered by the legacy system.',
      'The legacy system is switched off while a part is still routed to it => the switch-off is refused.',
    ],
  },
  'parallel-change': {
    title: titles.cutOver,
    invariant:
      'Both ways work until the old one is removed, users are moved over before it goes, and every step can be undone.',
    riskClass: 'data loss',
    acceptanceCriteria: [
      'Given the new way beside the old one, when a user uses either, then both give the same result.',
      'Given users moved to the new way, when a problem is found, then they can be moved back to the old way.',
      'Given every user is on the new way, when the old way is removed, then nothing calls it any more.',
    ],
    probes: [
      'The same input on the old and the new way => both give the same result.',
      'A user is moved back to the old way => the user keeps the data written on the new way.',
      'The old way is removed while a caller still uses it => the removal is refused and names the caller.',
    ],
  },
  rewrite: {
    title: titles.cutOver,
    invariant:
      'Users move once: the legacy system is frozen, the data is migrated and checked, the new system goes live, and the legacy system stays available for a return.',
    riskClass: 'data loss',
    acceptanceCriteria: [
      'Given the legacy system frozen for writes, when the final data migration runs, then the row counts of every target table equal those of its legacy table.',
      'Given the row counts match, when the new system goes live, then users reach the new system only.',
      'Given a failed check after going live, when the return is run, then users reach the legacy system with no data lost.',
    ],
    probes: [
      'A write to the legacy system after the freeze => it is refused.',
      'A row count that differs after the final run => the go-live is refused.',
      'The return is run after a failed check => users reach the legacy system with the data written before the freeze.',
    ],
  },
};

function fixedCard(text: CardText, fields: Pick<PlanTask, 'id' | 'phase' | 'dependsOn'>): PlanTask {
  return {
    ...fields,
    ...text,
    requirements: [],
    adds: [],
    files: [],
    identifiers: [],
    builds: [],
  };
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * P5-42: the plan with the skeleton card first, then the migrations card, the data-access card and
 * the harness, the cards of the plan, the data migration and the cut-over. Every card of the plan
 * waits for the skeleton and the data access (the migrations card for the skeleton only, since the
 * data access waits for it); the cut-over waits for all the others. A plan with no phase or no task
 * is returned as it is. A planner card that has the title of a fixed card is renamed, never taken for one.
 */
// P5-42
export function withFoundationCards(
  content: PlanContent,
  strategy: Strategy,
  tables: readonly ModelTable[],
): PlanContent {
  const last = content.phases.length;
  const tasks = content.tasks.map(unreserved);
  if (last === 0 || tasks.length === 0) return content;
  const ordered = [
    ...tasks.filter((task) => isMigrationCard(task)),
    ...tasks.filter((task) => !isMigrationCard(task)),
  ];
  const schemas = ordered.filter((task) => isMigrationCard(task)).length;
  const skeletonId = planId('T', 1);
  const accessId = planId('T', 2 + schemas);
  const harnessId = planId('T', 3 + schemas);
  const at = (index: number): string => planId('T', index < schemas ? 2 + index : 4 + index);
  const renamed = new Map(ordered.map((task, index) => [task.id, at(index)]));
  const moved = ordered.map((task, index): PlanTask => {
    const own = task.dependsOn.map((on) => renamed.get(on) ?? on);
    const waits = isMigrationCard(task) ? [skeletonId] : [skeletonId, accessId];
    return { ...task, id: at(index), dependsOn: unique([...waits, ...own]) };
  });
  const schemaIds = moved.slice(0, schemas).map((task) => task.id);
  const migrationId = planId('T', 4 + ordered.length);
  const cards = [
    fixedCard(skeleton, { id: skeletonId, phase: 1, dependsOn: [] }),
    ...moved.slice(0, schemas),
    fixedCard(access, { id: accessId, phase: 1, dependsOn: [skeletonId, ...schemaIds] }),
    fixedCard(harness, { id: harnessId, phase: 1, dependsOn: [skeletonId, accessId] }),
    ...moved.slice(schemas),
    fixedCard(migrationText(tables), {
      ...{ id: migrationId, phase: last },
      dependsOn: [skeletonId, accessId, ...schemaIds],
    }),
    fixedCard(cutOverTexts[strategy], {
      ...{ id: planId('T', 5 + ordered.length), phase: last },
      dependsOn: unique([
        skeletonId,
        migrationId,
        harnessId,
        ...moved.slice(schemas).map((task) => task.id),
      ]),
    }),
  ];
  const notes = content.requirementNotes?.map((note) =>
    note.kind === 'position' ? note : { ...note, task: renamed.get(note.task) ?? note.task },
  );
  return { ...content, tasks: cards, ...(notes === undefined ? {} : { requirementNotes: notes }) };
}
