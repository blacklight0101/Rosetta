import type { JSX } from 'preact';
import type { RuleResult, RuleState } from '../lib/password-rules.js';
import { Glyph, type GlyphName } from './Glyph.js';

// design-system.md section 14 (rule checklist): each password rule with a pass or fail glyph and
// words, so colour is never the only signal; it is rendered again as the person types (RF-1103).

export interface RuleChecklistProps {
  readonly rules: readonly RuleResult[];
  /** The list's id, so a password field can point at it with aria-describedby. */
  readonly id: string;
}

const glyphOf: Readonly<Record<RuleState, GlyphName>> = {
  pending: 'open-circle',
  pass: 'check',
  fail: 'cross',
};

const spokenState: Readonly<Record<RuleState, string>> = {
  pending: 'Not checked yet: ',
  pass: 'Met: ',
  fail: 'Not met: ',
};

// RF-1103
export function RuleChecklist({ rules, id }: RuleChecklistProps): JSX.Element {
  return (
    <ul id={id} class="rst-rules" aria-label="Password rules" aria-live="polite">
      {rules.map((rule) => (
        <li key={rule.id} class="rst-rule" data-state={rule.state}>
          <Glyph name={glyphOf[rule.state]} />
          <span class="rst-visually-hidden">{spokenState[rule.state]}</span>
          <span class="rst-rule__label">{rule.label}</span>
        </li>
      ))}
    </ul>
  );
}
