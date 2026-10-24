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

export interface StackData {
  /** The `v<n>` of `stack-rules.v<n>.yaml`; bump it when a rule is added, removed or changed. */
  readonly rulesVersion: number;
  readonly technologies: readonly StackTechnology[];
  readonly rules: readonly StackRule[];
}

/** No technology and no rule: a catalogue built by hand for a test that does not use the stack check. */
export const noStackData: StackData = { rulesVersion: 0, technologies: [], rules: [] };
