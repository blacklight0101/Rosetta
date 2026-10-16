import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import type { JourneyStatus, JourneyStep } from '../lib/live-run/journey.js';

// RF-1015, DEC-137, design-system.md section 5 (run journey): the steps of a run as an ordered
// list: map the code, read, check citations, explain, your questions. The current step carries
// `aria-current="step"`; every state is a glyph and a word, never colour alone.

const wordOf: Readonly<Record<JourneyStatus, string>> = {
  done: 'done',
  current: 'in progress',
  later: 'waiting',
};

function Marker(props: { readonly status: JourneyStatus; readonly number: number }): JSX.Element {
  return (
    <span class="rst-journey__n" aria-hidden="true">
      {props.status === 'done' ? <Glyph name="check" /> : props.number}
    </span>
  );
}

// RF-1015
export function RunJourney({ steps }: { readonly steps: readonly JourneyStep[] }): JSX.Element {
  const current = steps.find((step) => step.status === 'current');
  return (
    <ol class="rst-journey" aria-label="Run progress" data-testid="journey">
      {steps.map((step, index) => (
        <li
          key={step.key}
          class={`rst-journey__step rst-journey__step--${step.status}`}
          data-state={step.status}
          aria-current={step === current ? 'step' : undefined}
        >
          <Marker status={step.status} number={index + 1} />
          <span class="rst-journey__text" title={step.note}>
            <b class="rst-journey__title">{step.title}</b>
            <small class="rst-journey__detail">{step.detail}</small>
          </span>
          {step.note === undefined ? null : <span class="rst-visually-hidden">{step.note}</span>}
          <span class="rst-visually-hidden">{`(${wordOf[step.status]})`}</span>
        </li>
      ))}
    </ol>
  );
}
