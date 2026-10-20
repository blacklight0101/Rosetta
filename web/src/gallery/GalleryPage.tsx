import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';
import { useTheme } from '../app/use-theme.js';
import type { NavGroup } from '../app/navigation.js';
import { stateLists } from '../components/badge-specs.js';
import { Button, type ButtonVariant } from '../components/Button.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { Header } from '../components/Header.js';
import { Navigation } from '../components/Navigation.js';
import { RenderedText } from '../components/RenderedText.js';
import { StatusBadge, type BadgeChoice } from '../components/StatusBadge.js';

// P1-12: the component gallery, built only into the development server (design-system.md section
// 5). It shows every shared component in every state; follow the operating system's colour scheme
// or the toggle to see both themes. The sample figures are illustrative (section 7).

const variants: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'ghost',
  'link',
  'danger',
  'danger-outline',
];

const sampleNavigation: readonly NavGroup[] = [
  {
    id: 'main',
    items: [
      { path: '/projects', label: 'Projects', current: true },
      { path: '/settings', label: 'Settings and keys', current: false },
    ],
  },
  {
    id: 'project',
    label: 'Project: eShopModernizing',
    items: [
      { path: '/dev/gallery#start', label: 'Start a run', current: false },
      { path: '/dev/gallery#live', label: 'Live run', current: false },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [{ path: '/dev/gallery#users', label: 'Users and caps', current: false }],
  },
];

const options = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
];

// A card with a script, a handler and a javascript: link, as RF-507 rule 3 describes.
const hostileText =
  'Reads <script>alert(1)</script> and <img src=x onerror=alert(1)>; see ' +
  '[this](javascript:alert(1)) or https://github.com/dotnet-architecture/eShopModernizing/blob/main/README.md.';

const badgeRows: readonly { name: string; badges: readonly BadgeChoice[] }[] = [
  {
    name: 'ClaimStatus',
    badges: stateLists.ClaimStatus.map((value) => ({ list: 'ClaimStatus', value }) as const),
  },
  {
    name: 'CardType',
    badges: stateLists.CardType.map((value) => ({ list: 'CardType', value }) as const),
  },
  {
    name: 'OpenQuestionState',
    badges: stateLists.OpenQuestionState.map(
      (value) => ({ list: 'OpenQuestionState', value }) as const,
    ),
  },
  {
    name: 'QuestionShown',
    badges: stateLists.QuestionShown.map((value) => ({ list: 'QuestionShown', value }) as const),
  },
  {
    name: 'AgentTaskState',
    badges: stateLists.AgentTaskState.map((value) => ({ list: 'AgentTaskState', value }) as const),
  },
  {
    name: 'RunEndState',
    badges: stateLists.RunEndState.map((value) => ({ list: 'RunEndState', value }) as const),
  },
  {
    name: 'RunQueueState',
    badges: stateLists.RunQueueState.map((value) => ({ list: 'RunQueueState', value }) as const),
  },
  { name: 'Role', badges: stateLists.Role.map((value) => ({ list: 'Role', value }) as const) },
  {
    name: 'AccountState',
    badges: stateLists.AccountState.map((value) => ({ list: 'AccountState', value }) as const),
  },
  {
    name: 'MapLevel',
    badges: stateLists.MapLevel.map((value) => ({ list: 'MapLevel', value }) as const),
  },
  {
    name: 'Confidence',
    badges: stateLists.Confidence.map((value) => ({ list: 'Confidence', value }) as const),
  },
  {
    name: 'CallStatus',
    badges: stateLists.CallStatus.map((value) => ({ list: 'CallStatus', value }) as const),
  },
];

function Section(props: { id: string; title: string; children: ComponentChildren }): JSX.Element {
  return (
    <section class="rst-card rst-gallery__section" aria-labelledby={props.id}>
      <h2 id={props.id} class="rst-gallery__heading">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

function Buttons(): JSX.Element {
  return (
    <Section id="g-buttons" title="Buttons">
      {(['default', 'disabled', 'busy'] as const).map((state) => (
        <div key={state} class="rst-gallery__row">
          {variants.map((variant) => (
            <Button
              key={variant}
              variant={variant}
              busy={state === 'busy'}
              {...(state === 'disabled' ? { disabledReason: 'Not available in the gallery' } : {})}
            >
              {variant}
            </Button>
          ))}
        </div>
      ))}
    </Section>
  );
}

const ignore = (): void => undefined;

function TextFields(): JSX.Element {
  const [url, setUrl] = useState('https://github.com/owner/repository');
  return (
    <>
      <Field
        kind="url"
        id="g-url"
        label="GitHub repository URL"
        value={url}
        onInput={setUrl}
        help="A public repository."
      />
      <Field
        kind="url"
        id="g-url-bad"
        label="Invalid URL"
        value="https://github.com/owner/private"
        onInput={ignore}
        error={{ code: 'RST-1903', message: 'This repository is private or does not exist.' }}
      />
      <Field kind="text" id="g-off" label="Disabled" value="read only" onInput={ignore} disabled />
      <Field kind="password" id="g-pass" label="Password" value="" onInput={ignore} />
    </>
  );
}

function ChoiceFields(): JSX.Element {
  const [provider, setProvider] = useState('ollama');
  const [agreed, setAgreed] = useState(false);
  return (
    <>
      <Field
        kind="select"
        id="g-select"
        label="Provider"
        value={provider}
        options={options}
        onChange={setProvider}
      />
      <Field
        kind="radio"
        id="g-radio"
        label="Stage"
        value={provider}
        options={options}
        onChange={setProvider}
      />
      <Field
        kind="checkbox"
        id="g-check"
        label="I understand the code is sent to the provider"
        checked={agreed}
        onChange={setAgreed}
      />
    </>
  );
}

function Fields(): JSX.Element {
  return (
    <Section id="g-fields" title="Fields">
      <div class="rst-gallery__grid">
        <TextFields />
        <ChoiceFields />
      </div>
    </Section>
  );
}

function Badges(): JSX.Element {
  return (
    <Section id="g-badges" title="Status badges">
      <dl class="rst-gallery__badges">
        {badgeRows.map((row) => (
          <div key={row.name} class="rst-gallery__row">
            <dt class="rst-gallery__label">{row.name}</dt>
            <dd class="rst-gallery__row">
              {row.badges.map((badge) => (
                <StatusBadge key={badge.value} {...badge} />
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function GalleryPage(): JSX.Element {
  const [theme, setTheme] = useTheme();
  return (
    <div class="rst-gallery">
      <Header
        user={{ displayName: 'Gallery', role: 'admin' }}
        repository="dotnet-architecture/eShopModernizing"
        totals={<span>Your total 1,284,903 tokens $3.47</span>}
        theme={theme}
        onTheme={setTheme}
      />
      <main class="rst-gallery__main" id="main-content" tabIndex={-1}>
        <h1 class="rst-page__title">Component gallery</h1>
        <p class="rst-page__lead">Every shared component in every state. Development only.</p>
        <Buttons />
        <Fields />
        <Badges />
        <Section id="g-error" title="Error banner">
          <ErrorBanner
            error={{
              code: 'RST-2004',
              message: 'That project already exists.',
              nextStep: 'Open the existing project instead.',
            }}
          />
        </Section>
        <Section id="g-empty" title="Empty state">
          <EmptyState message="No runs yet.">
            <Button variant="primary">Start a run</Button>
          </EmptyState>
        </Section>
        <Section id="g-text" title="Rendered text">
          <p>
            <RenderedText text={hostileText} />
          </p>
        </Section>
        <Section id="g-nav" title="Navigation">
          <Navigation groups={sampleNavigation} />
        </Section>
      </main>
    </div>
  );
}
