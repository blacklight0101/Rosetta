import type { JSX } from 'preact';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import type { Step, StepStatus } from '../lib/live-run/run-stepper.js';

// RF-1002, design-system.md section 5 (pipeline stepper): the stages of a run as an ordered list, each
// done, current (`aria-current="step"`) or waiting. The state is a glyph and a word, never colour alone.

const glyphOf: Readonly<Record<StepStatus, GlyphName>> = {
  done: 'check',
  current: 'live-dot',
  waiting: 'open-circle',
};

const wordOf: Readonly<Record<StepStatus, string>> = {
  done: 'done',
  current: 'in progress',
  waiting: 'waiting',
};

function StepItem({ step }: { readonly step: Step }): JSX.Element {
  return (
    <li
      class="rst-live-stepper-item"
      data-state={step.status}
      aria-current={step.status === 'current' ? 'step' : undefined}
    >
      <span class={`rst-live-stepper-step rst-live-stepper-step--${step.status}`}>
        <Glyph name={glyphOf[step.status]} />
        <span>{step.name}</span>{' '}
        {step.detail === undefined ? null : (
          <span class="rst-live-stepper-detail">{`· ${step.detail}`}</span>
        )}{' '}
        <span class="rst-visually-hidden">{`(${wordOf[step.status]})`}</span>
      </span>
    </li>
  );
}

// RF-1002
export function RunStepper({ steps }: { readonly steps: readonly Step[] }): JSX.Element {
  return (
    <ol class="rst-live-stepper" aria-label="Pipeline" data-testid="stepper">
      {steps.map((step) => (
        <StepItem key={step.name} step={step} />
      ))}
    </ol>
  );
}
