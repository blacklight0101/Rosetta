import type { LegacyFacts } from './application-kind.js';
import {
  stackLayers,
  type ApplicationKind,
  type MigrationStrategy,
  type PlanningBrief,
  type StackLayer,
} from './planning-brief.js';
import type { StackData } from './stack-data.js';
import { matchingOptions } from './stack-offer.js';
import { typedAnswers } from './typed-answers.js';

// P5-39, DEC-172, RF-609, RF-610, DEC-80: what the plan proposes where the brief leaves a choice open. The
// kind of application is the owner's answer, else what the code map shows, else web. A stack layer
// the owner left open gets the catalogue's option for the layer and the kind, marked `proposed`; the
// owner's own choice is never touched. The migration strategy is checked against the kind and the
// code map: a strangler fig needs a seam where a request can be routed, and a desktop client has
// none, so its seam is the shared database, or the default strategy gives way to a rewrite. With an
// own migration answer (DEC-184) the default is checked only as the reference and is never changed.

interface ProposedLayer {
  readonly layer: StackLayer;
  readonly choice: string;
  readonly why: string;
}

export interface StrategyFit {
  readonly strategy: MigrationStrategy;
  /** Set when the seam between the two systems is the shared database (a desktop client). */
  readonly seam: 'shared-database' | null;
  /** The strategy the brief held, when the plan changed it (only a default strategy changes). */
  readonly changedFrom: MigrationStrategy | null;
  /**
   * Why the strategy does not fit and the owner kept it, or (with an own migration answer) why the
   * default strategy, checked as the reference, does not fit; null when it fits or was changed.
   */
  readonly finding: string | null;
  /** One sentence for the strategy record; empty when the strategy fits the kind. */
  readonly reason: string;
}

export interface PlanProposal {
  readonly kind: ApplicationKind;
  readonly kindFrom: 'owner' | 'code-map' | 'default';
  /** Rosetta's words, with at most three paths of the code map. */
  readonly kindReason: string;
  readonly layers: readonly ProposedLayer[];
  readonly fit: StrategyFit;
}

type Kind = Pick<PlanProposal, 'kind' | 'kindFrom' | 'kindReason'>;

function kindOf(brief: PlanningBrief, facts: LegacyFacts): Kind {
  if (brief.application !== undefined) {
    return { kind: brief.application, kindFrom: 'owner', kindReason: 'The owner answered it.' };
  }
  if (facts.detected !== undefined) {
    const { kind, examples } = facts.detected;
    const paths = examples.map((path) => `\`${path}\``).join(', ');
    return {
      kind,
      kindFrom: 'code-map',
      kindReason: `The code map shows a ${kind} application; for example ${paths}.`,
    };
  }
  return {
    kind: 'web',
    kindFrom: 'default',
    kindReason: 'No file of the code map shows the kind, so Rosetta assumed a web application.',
  };
}

function layersOf(
  brief: PlanningBrief,
  kind: ApplicationKind,
  facts: LegacyFacts,
  stack: StackData,
): ProposedLayer[] {
  if (kind === 'keep') return [];
  const answered = new Set(brief.stack.map((entry) => entry.layer));
  return stackLayers.flatMap((layer) => {
    if (answered.has(layer)) return [];
    const [option] = matchingOptions(stack, kind, layer, facts.languages);
    return option === undefined ? [] : [{ layer, choice: option.choice, why: option.why }];
  });
}

const noRoute =
  'A desktop client is one process, so no request reaches it that a routing layer could send to the new system.';

function fitOf(brief: PlanningBrief, kind: ApplicationKind, facts: LegacyFacts): StrategyFit {
  const kept: StrategyFit = {
    strategy: brief.migration,
    seam: null,
    changedFrom: null,
    finding: null,
    reason: '',
  };
  if (kind !== 'desktop' || brief.migration !== 'strangler-fig') return kept;
  if (typedAnswers(brief).migration !== undefined) {
    // DEC-184: the owner typed an own strategy, so the default is checked only as the reference:
    // nothing is changed and no seam record is written for a strategy nobody chose.
    const seam = facts.database
      ? 'The code map shows a database both systems use, which could be the seam.'
      : 'The code map shows no shared database to use as a seam.';
    const reason = `${noRoute} ${seam}`;
    return { ...kept, finding: reason, reason };
  }
  if (facts.database) {
    const reason = `${noRoute} The seam is the database both systems use: the new system runs against the legacy schema until the last phase.`;
    return { ...kept, seam: 'shared-database', reason };
  }
  if (brief.defaulted.includes('migration')) {
    const reason = `${noRoute} The code map shows no shared database to use as a seam, so the default strangler fig gives way to a full rewrite with a single cut-over.`;
    return { ...kept, strategy: 'rewrite', changedFrom: 'strangler-fig', reason };
  }
  const reason = `${noRoute} The code map shows no shared database to use as a seam.`;
  return { ...kept, finding: reason, reason };
}

/** The brief the plan is written from, and what Rosetta proposed to make it. */
// RF-609, RF-610
export function proposeFor(
  brief: PlanningBrief,
  facts: LegacyFacts,
  stack: StackData,
): { readonly brief: PlanningBrief; readonly proposal: PlanProposal } {
  const where = kindOf(brief, facts);
  const layers = layersOf(brief, where.kind, facts, stack);
  const fit = fitOf(brief, where.kind, facts);
  const proposed = layers.map((each) => ({
    layer: each.layer,
    choice: each.choice,
    custom: false,
    proposed: true as const,
  }));
  const merged = [...brief.stack, ...proposed].sort(
    (a, b) => stackLayers.indexOf(a.layer) - stackLayers.indexOf(b.layer),
  );
  return {
    brief: { ...brief, application: where.kind, migration: fit.strategy, stack: merged },
    proposal: { ...where, layers, fit },
  };
}
