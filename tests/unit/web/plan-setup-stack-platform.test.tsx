import { fireEvent, render, screen, within } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { describe, expect, it } from 'vitest';
import type { StackOffer } from '../../../web/src/api/plan-schemas.js';
import { draftOf, type Draft } from '../../../web/src/lib/plan-setup/draft.js';
import {
  languageOf,
  platformClashLine,
  platformProposals,
} from '../../../web/src/lib/plan-setup/stack-platform.js';
import type { OptionsLoad } from '../../../web/src/pages/use-plan-options.js';
import { PlanStackStep } from '../../../web/src/pages/PlanStackStep.js';
import { catalogue, planOptions, unsavedBrief } from './plan-setup-fixtures.js';

// RF-609, RF-645, DEC-208, DEC-211 (P8-21): the Stack step follows the language and runtime chosen,
// with the option cards of the other steps.

const ids = [
  'language-runtime',
  'backend-framework',
  'front-end',
  'database',
  'data-access',
  'testing',
  'hosting',
];
const pair = (choice: string) => ({ choice, why: `${choice} suits it.` });

const platformProposalsOf: Record<string, Record<string, string[]>> = {
  '.NET': {
    'backend-framework': ['ASP.NET Core Razor Pages', 'ASP.NET Core MVC'],
    'front-end': ['Razor Pages', 'Blazor'],
    database: ['SQL Server'],
    'data-access': ['Dapper', 'Entity Framework Core'],
    testing: ['xUnit', 'NUnit'],
    hosting: ['IIS'],
  },
  Java: {
    'backend-framework': ['Spring Boot'],
    'front-end': ['Thymeleaf'],
    database: ['PostgreSQL'],
    'data-access': ['Spring Data JPA'],
    testing: ['JUnit 5'],
    hosting: ['Docker containers'],
  },
};

const tagged: Record<string, { name: string; aliases: string[]; platform: string }[]> = {
  'language-runtime': [
    { name: 'C# on .NET', aliases: ['c#', '.net'], platform: '.NET' },
    { name: 'Java', aliases: ['java'], platform: 'Java' },
  ],
  'backend-framework': [{ name: 'Fastify', aliases: ['fastify'], platform: 'Node.js' }],
  testing: [{ name: 'Vitest', aliases: ['vitest'], platform: 'Node.js' }],
};

const legacyProposals: Record<string, string[]> = {
  'language-runtime': ['C# on .NET', 'Java'],
  'backend-framework': ['Fastify'],
  'front-end': ['React', 'Angular'],
  database: ['PostgreSQL'],
  'data-access': [],
  testing: ['Vitest'],
  hosting: ['Docker containers'],
};

const offer = {
  layers: ids.map((layer) => ({
    layer,
    proposals: (legacyProposals[layer] ?? []).map(pair),
    keepLegacy: false,
    vague: [],
    technologies: tagged[layer] ?? [],
    platforms:
      layer === 'language-runtime'
        ? []
        : Object.entries(platformProposalsOf).map(([platform, byLayer]) => ({
            platform,
            proposals: (byLayer[layer] ?? []).map(pair),
          })),
  })),
} as unknown as StackOffer;

function Harness(props: {
  readonly start: Draft;
  readonly seen: Draft[];
  readonly load?: OptionsLoad;
}) {
  const [draft, setDraft] = useState(props.start);
  props.seen.push(draft);
  return (
    <PlanStackStep
      draft={draft}
      catalogue={catalogue}
      change={setDraft}
      problems={{}}
      load={props.load ?? { status: 'idle' }}
      offer={offer}
      waitingForConsent={false}
      askAgain={() => undefined}
    />
  );
}

function show(stack: Draft['stack'] = {}): Draft[] {
  const seen: Draft[] = [];
  render(<Harness start={{ ...draftOf(unsavedBrief.brief), stack }} seen={seen} />);
  return seen;
}

const group = (name: string): HTMLElement => screen.getByRole('radiogroup', { name });
const titles = (name: string): string[] =>
  within(group(name))
    .getAllByRole('radio')
    .map((radio) => radio.closest('.rst-plan-opt')?.querySelector('label')?.textContent ?? '');
const pickLanguage = (title: RegExp): void => {
  fireEvent.click(within(group('Language and runtime')).getByRole('radio', { name: title }));
};

describe('the lib: the platform of the chosen language', () => {
  const draft = (choice: string): Draft => ({
    ...draftOf(unsavedBrief.brief),
    stack: { 'language-runtime': { layer: 'language-runtime', choice, custom: false } },
  });

  it('RF-609 finds the language and its platform from the option or a typed alias', () => {
    expect(languageOf(offer, draft('C# on .NET'))).toEqual({
      name: 'C# on .NET',
      platform: '.NET',
    });
    expect(languageOf(offer, draft('dotnet or .net 8'))?.platform).toBe('.NET');
    expect(languageOf(offer, draft('Go'))).toBeUndefined();
    expect(languageOf(offer, { ...draft('x'), stack: {} })).toBeUndefined();
  });

  it('RF-609 gives the proposals of the platform for a layer, none for a language with no platform', () => {
    expect(platformProposals(offer, 'testing', '.NET')?.map((each) => each.choice)).toEqual([
      'xUnit',
      'NUnit',
    ]);
    expect(platformProposals(offer, 'testing', undefined)).toBeUndefined();
  });

  it('RF-609 says a technology of another platform clashes with the language, and only then', () => {
    const base = draft('C# on .NET');
    const withFastify = {
      ...base,
      stack: {
        ...base.stack,
        'backend-framework': { layer: 'backend-framework', choice: 'Fastify', custom: false },
      },
    };
    expect(platformClashLine(offer, withFastify, 'backend-framework')).toBe(
      'Fastify is a Node.js technology, and the language is C# on .NET. Keep it only if that is intended; the package will list it as a clash.',
    );
    expect(platformClashLine(offer, base, 'backend-framework')).toBeUndefined();
    const same = {
      ...base,
      stack: { ...base.stack, testing: { layer: 'testing', choice: 'xUnit', custom: false } },
    };
    expect(platformClashLine(offer, same, 'testing')).toBeUndefined();
  });
});

describe('the Stack step: option cards', () => {
  it('RF-645 shows each layer as a group of option cards with the first marked (Recommended) and your own last', () => {
    show();

    const cards = group('Database').querySelectorAll('.rst-plan-opt');
    expect(cards.length).toBe(2);
    expect(titles('Database')[0]).toBe('PostgreSQL (Recommended)');
    expect(titles('Database').at(-1)).toBe('Type your own answer');
    expect(screen.getAllByRole('radiogroup')).toHaveLength(7);
  });

  it('RF-645 typing your own answer opens a field and saves it as a custom choice', () => {
    const seen = show();

    fireEvent.click(within(group('Hosting')).getByRole('radio', { name: 'Type your own answer' }));
    fireEvent.input(within(group('Hosting')).getByLabelText('Your answer for Hosting'), {
      target: { value: 'Kubernetes' },
    });

    const last = seen.at(-1);
    expect(last?.stack['hosting']).toMatchObject({ choice: 'Kubernetes', custom: true });
    expect(last?.chosen['stack.hosting']).toBe('typed');
  });
});

describe('the Stack step follows the language (DEC-208)', () => {
  it('RF-609 before a language is picked the layers suggest from the legacy code and say so', () => {
    show();

    expect(titles('Back-end framework')[0]).toBe('Fastify (Recommended)');
    expect(screen.getByRole('status').textContent).toMatch(/Pick a language first/u);
    expect(screen.getAllByText('Suggested from the legacy code').length).toBeGreaterThan(0);
  });

  it('RF-609 picking C# on .NET changes the layers and says so in one line', () => {
    show();

    pickLanguage(/^C# on \.NET/u);

    expect(titles('Back-end framework')[0]).toBe('ASP.NET Core Razor Pages (Recommended)');
    expect(titles('Testing').slice(0, 2)).toEqual(['xUnit (Recommended)', 'NUnit']);
    expect(titles('Data access').slice(0, 2)).toEqual([
      'Dapper (Recommended)',
      'Entity Framework Core',
    ]);
    expect(
      screen.getByText('The layers below suggest technologies for C# on .NET.', { exact: false }),
    ).toBeTruthy();
    expect(screen.getAllByText('Suggested for C# on .NET', { selector: 'span' }).length).toBe(6);
  });

  it('RF-609 picking another language changes the layers again', () => {
    show();

    pickLanguage(/^C# on \.NET/u);
    pickLanguage(/^Java/u);

    expect(titles('Back-end framework')[0]).toBe('Spring Boot (Recommended)');
    expect(titles('Testing')[0]).toBe('JUnit 5 (Recommended)');
    pickLanguage(/^C# on \.NET/u);
    expect(titles('Testing')[0]).toBe('xUnit (Recommended)');
  });
});

describe('the Stack step keeps what the owner answered (DEC-208)', () => {
  it('RF-609 a layer the owner answered is never changed and says it is the owner choice', () => {
    show({
      testing: { layer: 'testing', choice: 'Vitest', custom: false, offered: ['Vitest'] },
    });

    pickLanguage(/^C# on \.NET/u);

    const own = within(group('Testing')).getByRole<HTMLInputElement>('radio', {
      name: /^Type your own answer/u,
    });
    expect(own.checked).toBe(true);
    expect(within(group('Testing')).getByDisplayValue('Vitest')).toBeTruthy();
  });

  it('RF-609 a layer answered with a technology of another platform shows one warning line', () => {
    show({
      'backend-framework': { layer: 'backend-framework', choice: 'Fastify', custom: false },
    });

    pickLanguage(/^C# on \.NET/u);

    const note = screen.getByRole('note');
    expect(note.textContent).toContain(
      'Fastify is a Node.js technology, and the language is C# on .NET.',
    );
    expect(screen.getAllByRole('note')).toHaveLength(1);
  });

  it('RF-609 a language with no platform keeps the legacy proposals', () => {
    show();

    fireEvent.click(
      within(group('Language and runtime')).getByRole('radio', { name: 'Type your own answer' }),
    );
    fireEvent.input(
      within(group('Language and runtime')).getByLabelText('Your answer for Language and runtime'),
      {
        target: { value: 'Go' },
      },
    );

    expect(titles('Back-end framework')[0]).toBe('Fastify (Recommended)');
  });
});

describe('the Stack step text', () => {
  it('RF-645 says the proposals follow the language and claims at most two for a layer', async () => {
    const { STEP_TEXT } = await import('../../../web/src/lib/plan-setup/steps.js');
    expect(STEP_TEXT.stack.why).toContain('up to two');
    expect(STEP_TEXT.stack.why).not.toContain('Two proposals per layer');
    expect(STEP_TEXT.stack.why).toContain('language');
  });
});

describe('the Stack step with the planner options loaded (DEC-208)', () => {
  it('RF-609 the proposals of the chosen platform win over the planner options of the legacy code', () => {
    const load: OptionsLoad = { status: 'ready', options: planOptions };
    render(<Harness start={draftOf(unsavedBrief.brief)} seen={[]} load={load} />);
    expect(titles('Back-end framework')[0]).not.toContain('ASP.NET');
    const language = within(group('Language and runtime'));
    fireEvent.click(language.getByRole('radio', { name: 'Type your own answer' }));
    fireEvent.input(language.getByLabelText('Your answer for Language and runtime'), {
      target: { value: 'C# on .NET' },
    });

    expect(titles('Back-end framework')[0]).toBe('ASP.NET Core Razor Pages (Recommended)');
  });
});
