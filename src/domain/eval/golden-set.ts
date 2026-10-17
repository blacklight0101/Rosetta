import type { CardType } from '../cards/card-vocabulary.js';
import type { Citation } from '../cards/citation.js';

// RNF-006, RNF-015, DEC-57, ADR-008: the golden set, the hand-checked findings of the demo app that
// score an evaluation. A finding is a feature, a business rule or an entity, or (RF-260..RF-262) a
// step of a flow, a field or an action of a screen, or a relation of an entity, with the lines that
// show it and the words a claim about it uses; an absence is a statement whose correct answer is
// "not in the code", with the words of a claim that would wrongly state it.

export const FINDING_KINDS = [
  'feature',
  'rule',
  'entity',
  'step',
  'field',
  'action',
  'relation',
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

/** The kinds that describe flows, screens and the data model; they have their own measures. */
export const STRUCTURE_KINDS = ['step', 'field', 'action', 'relation'] as const;

export interface GoldenFinding {
  /** Unique in the set. */
  readonly id: string;
  readonly kind: FindingKind;
  /** The finding in one plain sentence, as a person checked it. */
  readonly statement: string;
  /** The flow, screen or entity a step, field, action or relation belongs to; required for those kinds. */
  readonly of?: string | undefined;
  /** The card types a matching claim may sit on; every type when empty. */
  readonly cardTypes: readonly CardType[];
  /** The lines that show the finding; a matching claim cites lines that overlap one of them. */
  readonly evidence: readonly Citation[];
  /** A matching claim names at least one of these, in its text or its card's title, in any case. */
  readonly keywords: readonly string[];
}

export interface GoldenAbsence {
  /** Unique in the set. */
  readonly id: string;
  /** What is not in the code, in one plain sentence. */
  readonly statement: string;
  /** A claim states the absent thing when it holds every word of one of these lists. */
  readonly claimPatterns: readonly (readonly string[])[];
  /** Words that say the thing is absent; a claim holding one of them is not counted as wrong. */
  readonly unless: readonly string[];
}

export interface GoldenCase {
  /** Unique in the set. */
  readonly id: string;
  readonly title: string;
  /** The files the case is about; they decide the areas the evaluation runs and the claims it scores. */
  readonly paths: readonly string[];
  readonly findings: readonly GoldenFinding[];
  readonly absences: readonly GoldenAbsence[];
}

/** The public GitHub repository, pinned to a commit, that the golden set describes. */
interface GoldenSource {
  readonly url: string;
  readonly owner: string;
  readonly repo: string;
  /** Forty lower-case hexadecimal characters. */
  readonly commit: string;
  /** The analysed folder, `` for the whole repository. */
  readonly subpath: string;
}

export interface GoldenSet {
  readonly schemaVersion: 1;
  /** Changes whenever a finding or an absence changes, so results name the set they used. */
  readonly version: string;
  readonly description: string;
  readonly source: GoldenSource;
  readonly cases: readonly GoldenCase[];
}
