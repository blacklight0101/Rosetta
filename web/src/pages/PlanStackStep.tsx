import type { JSX } from 'preact';
import type { StackOffer } from '../api/plan-schemas.js';
import { languageOf } from '../lib/plan-setup/stack-platform.js';
import { questionOptions } from '../lib/plan-setup/question-options.js';
import { STACK_LAYERS } from '../lib/plan-setup/steps.js';
import { PlanOptionsNotice } from './PlanOptionsNotice.js';
import { PlanStackLayer } from './PlanStackLayer.js';
import { PlanStepCard } from './PlanStepCard.js';
import type { StepProps } from './PlanPrinciplesStep.js';
import type { OptionsLoad } from './use-plan-options.js';

// RF-609, DEC-208, DEC-211, design-system.md section 14 (Plan setup): the language and runtime first,
// then one group of option cards for each layer below it. The layers suggest the technologies of the
// language once it is chosen, and the legacy-derived ones until then.

export interface StackProps extends StepProps {
  readonly load: OptionsLoad;
  readonly offer?: StackOffer | undefined;
  readonly waitingForConsent: boolean;
  readonly askAgain: () => void;
}

const LANGUAGE_HINT =
  'Choose this first: the layers below suggest technologies of the language you pick.';

function hintOf(offer: StackOffer | undefined): string {
  const language = offer?.layers.find((each) => each.layer === 'language-runtime');
  const kept = language?.keepLegacy === false;
  return `${LANGUAGE_HINT}${kept ? ' Keeping the legacy technology is not offered for this layer.' : ''}`;
}

function bannerOf(language: string | undefined, answered: boolean): string {
  if (language !== undefined) {
    return `The layers below suggest technologies for ${language}. Layers you answered keep your answer.`;
  }
  return answered
    ? 'The catalogue has no proposals for that language, so the layers below suggest from the legacy code.'
    : 'Pick a language first. Until then the layers suggest from the legacy code.';
}

// RF-609
export function PlanStackStep(props: StackProps): JSX.Element {
  const { draft, change, problems, load } = props;
  const options = load.status === 'ready' ? load.options : undefined;
  const language = languageOf(props.offer, draft);
  const below = (id: string): string | undefined =>
    id === 'language-runtime' ? undefined : language?.platform;
  const layers = STACK_LAYERS.map((layer) => {
    const shown = questionOptions(`stack.${layer.id}`, {
      ...{ catalogue: props.catalogue, options, offer: props.offer },
      platform: below(layer.id),
    });
    return (
      <PlanStackLayer
        key={layer.id}
        layer={layer}
        options={shown}
        // RF-645, P8-22: every card shown is an option, the "Keep the legacy technology" one too.
        offered={shown.map((option) => option.title)}
        draft={draft}
        change={change}
        problem={problems[`stack.${layer.id}`]}
        offer={props.offer}
        language={language?.name}
        hint={layer.id === 'language-runtime' ? hintOf(props.offer) : undefined}
      />
    );
  });
  return (
    <PlanStepCard
      step="stack"
      defaultText="Default: the recommended option of each layer; a layer you skip takes it."
    >
      <PlanOptionsNotice
        load={load}
        waitingForConsent={props.waitingForConsent}
        askAgain={props.askAgain}
      />
      <div class="rst-plan-layers">
        {layers.slice(0, 1)}
        <div
          role="status"
          class={`rst-plan-banner${language === undefined ? '' : ' rst-plan-banner--language'}`}
        >
          {bannerOf(language?.name, draft.stack['language-runtime'] !== undefined)}
        </div>
        {layers.slice(1)}
      </div>
    </PlanStepCard>
  );
}
