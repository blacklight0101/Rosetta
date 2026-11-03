import type { LegacyFacts } from './application-kind.js';
import {
  stackLayers,
  type ApplicationKind,
  type MigrationStrategy,
  type PlanningBrief,
  type StackLayer,
} from './planning-brief.js';
import type { StackData, VagueWords } from './stack-data.js';
import { matchingOptions, platformOptions } from './stack-offer.js';
import { languagePlatform } from './stack-platform.js';
import { vagueMatch } from './vague-choice.js';
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

/**
 * P8-09: a vague answer for a layer the catalogue has no option for (or for a kept application) is
 * still open: the layer is listed as proposed with the typed words, and the reason names what the
 * scan found, so the owner is not told a technology was decided.
 */
function openLayer(own: StackChoiceOf, facts: LegacyFacts, kind: ApplicationKind): ProposedLayer {
  const found =
    facts.languages.length === 0
      ? 'The scan found no language.'
      : `The scan found ${facts.languages.join(', ')}.`;
  const reason =
    kind === 'keep'
      ? 'The application is kept as it is, so the catalogue proposes no technology.'
      : `The catalogue has no option for this layer of a ${kind} application.`;
  return {
    layer: own.layer,
    choice: own.choice,
    why: `You typed "${own.choice}", which names no technology. ${reason} ${found} Pick a technology in Plan setup.`,
  };
}

type StackChoiceOf = PlanningBrief['stack'][number];

function layersOf(
  brief: PlanningBrief,
  kind: ApplicationKind,
  facts: LegacyFacts,
  stack: StackData,
): ProposedLayer[] {
  // P7-30: a typed answer that names only a platform leaves its layer open, with the platform's options.
  const typed = new Map(brief.stack.map((entry) => [entry.layer, entry]));
  // DEC-208: the language the owner chose decides the platform of every open layer.
  const chosen = languagePlatform(brief, stack)?.group;
  return stackLayers.flatMap((layer) => {
    const own = typed.get(layer);
    const vague = own?.custom === true ? vagueMatch(stack, layer, own.choice) : undefined;
    if (own !== undefined && vague === undefined) return [];
    const found =
      kind === 'keep' ? undefined : optionOf(stack, { kind, layer, vague: vague ?? chosen }, facts);
    if (found === undefined) return own === undefined ? [] : [openLayer(own, facts, kind)];
    const why =
      own === undefined
        ? found.why
        : `You typed "${own.choice}", which names no technology. ${found.why}`;
    return [{ layer, choice: found.choice, why }];
  });
}

/** The catalogue's first option for the layer: the platform's (a vague answer, or the language chosen), else the scan's. */
function optionOf(
  stack: StackData,
  want: { kind: ApplicationKind; layer: StackLayer; vague: VagueWords | undefined },
  facts: LegacyFacts,
): { readonly choice: string; readonly why: string } | undefined {
  const { kind, layer, vague } = want;
  const options =
    vague === undefined
      ? []
      : platformOptions(stack, { kind, layer, platform: vague, scanned: facts.languages });
  return (options.length > 0 ? options : matchingOptions(stack, kind, layer, facts.languages))[0];
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
  const opened = new Set(layers.map((each) => each.layer));
  const kept = brief.stack.filter((entry) => !opened.has(entry.layer));
  const merged = [...kept, ...proposed].sort(
    (a, b) => stackLayers.indexOf(a.layer) - stackLayers.indexOf(b.layer),
  );
  return {
    brief: {
      ...brief,
      application: where.kind,
      migration: fit.strategy,
      stack: merged,
      // P7-30: a layer opened by a platform-only answer is listed among the open questions.
      defaulted: [
        ...brief.defaulted,
        ...[...opened]
          .map((layer) => `stack.${layer}`)
          .filter((id) => !brief.defaulted.includes(id)),
      ],
    },
    proposal: { ...where, layers, fit },
  };
}
