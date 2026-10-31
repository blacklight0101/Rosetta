// RF-609, RNF-004: the shapes of the stack data of the catalogue, read from
// `prompts/catalogue/stack-technologies.v<n>.yaml` and `stack-rules.v<n>.yaml`. The layer is a plain
// string here (the loader checks it against the layers of the brief), so that the catalogue can hold
// the data without importing the brief.

export type StackTrait = 'server-rendered' | 'single-page' | 'api-only';

export interface StackTechnology {
  readonly layer: string;
  readonly name: string;
  /** Lower case; matched as whole words inside a free-text choice. */
  readonly aliases: readonly string[];
  /** Empty for a technology known by name that no rule reads. */
  readonly traits: readonly StackTrait[];
  /** One line. */
  readonly description: string;
}

export type RuleCondition =
  | {
      readonly on: 'trait';
      readonly layer: string;
      readonly trait: StackTrait;
      readonly present: boolean;
    }
  | { readonly on: 'contract'; readonly present: boolean };

export interface StackRule {
  readonly id: string;
  /** Every condition must hold for the rule to match. */
  readonly matches: readonly RuleCondition[];
  /** The clash in words; `{front-end}` and `{backend-framework}` stand for the owner's choices. */
  readonly clash: string;
  readonly question: string;
  /** The default of the question; it starts with the legacy-keeping default (RF-631). */
  readonly answer: string;
}

/** P5-39: how the plan tells the kind of a legacy application from its files; the first group with a match wins. */
export interface KindSignal {
  readonly kind: 'web' | 'desktop' | 'service';
  /** Artefact kinds of the scan (RF-102). */
  readonly artefacts: readonly string[];
  /** Lower case, without the dot. */
  readonly extensions: readonly string[];
  /** Lower case ends of a file name, with the dot. */
  readonly suffixes: readonly string[];
}

/** P5-39: the technology Rosetta proposes for a layer of a kind of application. */
export interface StackOption {
  readonly kind: 'web' | 'desktop' | 'service';
  readonly layer: string;
  /** Language ids of the scan; the option applies when one is among the legacy languages. Empty: any. */
  readonly legacy: readonly string[];
  /** The `name` of a technology of the layer. */
  readonly choice: string;
  /** One line. */
  readonly why: string;
}

/**
 * P7-29, DEC-203: a legacy technology the scan can name, and whether it is end of life. A layer
 * whose legacy technology is end of life does not offer "Keep the legacy technology".
 */
export interface LegacyTechnology {
  readonly name: string;
  /** Language ids of the scan that show it. */
  readonly languages: readonly string[];
  /** The layers it is the legacy technology of; empty: every layer. */
  readonly layers: readonly string[];
  readonly endOfLife: boolean;
}

export interface StackProposals {
  readonly signals: readonly KindSignal[];
  readonly options: readonly StackOption[];
  readonly legacy: readonly LegacyTechnology[];
}

const noStackProposals: StackProposals = { signals: [], options: [], legacy: [] };

export interface StackData {
  /** The `v<n>` of `stack-rules.v<n>.yaml`; bump it when a rule is added, removed or changed. */
  readonly rulesVersion: number;
  readonly technologies: readonly StackTechnology[];
  readonly rules: readonly StackRule[];
  readonly proposals: StackProposals;
}

/** No technology and no rule: a catalogue built by hand for a test that does not use the stack check. */
export const noStackData: StackData = {
  rulesVersion: 0,
  technologies: [],
  rules: [],
  proposals: noStackProposals,
};
