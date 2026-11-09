import { describe, expect, it } from 'vitest';
import { stackOfferFor, type LayerOffer } from '../../../../src/domain/planning/stack-offer.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-609, DEC-208 (P8-21): the offer names the platform of each technology of the language and runtime
// layer and, per layer, the proposals of each platform for the kind of application.

const stack = shippedCatalogue.stack;
const legacyJavascript = {
  kind: 'web',
  languages: ['javascript'],
  extensions: [],
  workbook: false,
} as const;

const belowTheLanguage = [
  'backend-framework',
  'front-end',
  'database',
  'data-access',
  'testing',
  'hosting',
] as const;

function proposalsOf(
  offer: readonly LayerOffer[],
  layer: string,
  platform: string,
): readonly string[] | undefined {
  return offer
    .find((each) => each.layer === layer)
    ?.platforms.find((each) => each.platform === platform)
    ?.proposals.map((each) => each.choice);
}

describe('stackOfferFor: the platform of each language (DEC-208)', () => {
  it('RF-609 names the platform of C# on .NET, Java, TypeScript on Node.js and Python', () => {
    const offer = stackOfferFor(legacyJavascript, stack);
    const language = offer.find((each) => each.layer === 'language-runtime');

    const named = Object.fromEntries(
      (language?.technologies ?? []).map((each) => [each.name, each.platform]),
    );
    expect(named).toEqual({
      'C# on .NET': '.NET',
      Java: 'Java',
      'TypeScript on Node.js': 'Node.js',
      Python: 'Python',
    });
  });

  it('RF-609 names the platform of a technology of another layer, such as Fastify and xUnit', () => {
    const offer = stackOfferFor(legacyJavascript, stack);

    const backend = offer.find((each) => each.layer === 'backend-framework');
    expect(backend?.technologies.find((each) => each.name === 'Fastify')?.platform).toBe('Node.js');
    const testing = offer.find((each) => each.layer === 'testing');
    expect(testing?.technologies.find((each) => each.name === 'xUnit')?.platform).toBe('.NET');
  });
});

describe('stackOfferFor: proposals by platform on a web application (DEC-208)', () => {
  const offer = stackOfferFor(legacyJavascript, stack);

  it('RF-609 offers C# on .NET the .NET technologies, recommended first, though the legacy code is JavaScript', () => {
    expect(proposalsOf(offer, 'backend-framework', '.NET')).toEqual([
      'ASP.NET Core Razor Pages',
      'ASP.NET Core MVC',
    ]);
    expect(proposalsOf(offer, 'front-end', '.NET')).toEqual(['Razor Pages', 'Blazor']);
    expect(proposalsOf(offer, 'database', '.NET')).toEqual(['SQL Server', 'PostgreSQL']);
    expect(proposalsOf(offer, 'data-access', '.NET')).toEqual(['Dapper', 'Entity Framework Core']);
    expect(proposalsOf(offer, 'testing', '.NET')).toEqual(['xUnit', 'NUnit']);
    expect(proposalsOf(offer, 'hosting', '.NET')).toEqual(['IIS', 'Docker containers']);
  });

  it('RF-609 offers Java its ecosystem', () => {
    expect(proposalsOf(offer, 'backend-framework', 'Java')).toEqual(['Spring Boot']);
    expect(proposalsOf(offer, 'front-end', 'Java')).toEqual(['Thymeleaf', 'React']);
    expect(proposalsOf(offer, 'database', 'Java')).toEqual(['PostgreSQL']);
    expect(proposalsOf(offer, 'data-access', 'Java')).toEqual(['Spring Data JPA', 'MyBatis']);
    expect(proposalsOf(offer, 'testing', 'Java')).toEqual(['JUnit 5']);
    expect(proposalsOf(offer, 'hosting', 'Java')?.[0]).toBe('Docker containers');
  });

  it('RF-609 offers Python its ecosystem', () => {
    expect(proposalsOf(offer, 'backend-framework', 'Python')).toEqual(['FastAPI', 'Django']);
    expect(proposalsOf(offer, 'front-end', 'Python')).toEqual(['React', 'Django templates']);
    expect(proposalsOf(offer, 'data-access', 'Python')).toEqual(['SQLAlchemy']);
    expect(proposalsOf(offer, 'testing', 'Python')).toEqual(['pytest']);
  });

  it('RF-609 offers TypeScript on Node.js its ecosystem, and no .NET or Python tool', () => {
    expect(proposalsOf(offer, 'backend-framework', 'Node.js')).toEqual(['Fastify']);
    expect(proposalsOf(offer, 'data-access', 'Node.js')).toEqual(['Prisma', 'Knex.js']);
    expect(proposalsOf(offer, 'testing', 'Node.js')).toEqual(['Vitest']);
  });
});

describe('stackOfferFor: every platform covers the web layers (DEC-208)', () => {
  const offer = stackOfferFor(legacyJavascript, stack);

  it('RF-609 DEC-208 every platform has at least one proposal for each layer below the language (web kind)', () => {
    const platforms = ['.NET', 'Java', 'Node.js', 'Python'];
    for (const platform of platforms) {
      for (const layer of belowTheLanguage) {
        const found = proposalsOf(offer, layer, platform) ?? [];
        expect(found.length, `${platform} ${layer}`).toBeGreaterThan(0);
        expect(found.length, `${platform} ${layer}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('RF-609 gives the same platform proposals whatever the legacy languages are', () => {
    const other = stackOfferFor(
      { kind: 'web', languages: ['python'], extensions: [], workbook: false },
      stack,
    );
    for (const layer of belowTheLanguage) {
      expect(proposalsOf(other, layer, '.NET')).toEqual(proposalsOf(offer, layer, '.NET'));
    }
  });

  it('RF-609 keeps the legacy-derived proposals of the layer as they are', () => {
    const backend = offer.find((each) => each.layer === 'backend-framework');
    expect(backend?.proposals.map((each) => each.choice)).toEqual(['Fastify']);
  });
});

describe('stackOfferFor: platforms of the other kinds (DEC-208)', () => {
  it('RF-609 a service on .NET gets the ASP.NET Core service frameworks', () => {
    const service = stackOfferFor(
      { kind: 'service', languages: ['java'], extensions: [], workbook: false },
      stack,
    );
    expect(proposalsOf(service, 'backend-framework', '.NET')).toEqual([
      'ASP.NET Core Web API',
      'ASP.NET Core Minimal APIs',
    ]);
    expect(proposalsOf(service, 'testing', '.NET')).toEqual(['xUnit']);
  });

  it('RF-609 a desktop client on .NET gets the desktop toolkits and a Node.js platform gets no .NET tool', () => {
    const desktop = stackOfferFor(
      { kind: 'desktop', languages: ['java'], extensions: [], workbook: false },
      stack,
    );
    expect(proposalsOf(desktop, 'front-end', '.NET')).toEqual(['Windows Forms on .NET', 'WPF']);
    expect(proposalsOf(desktop, 'testing', 'Node.js')).toEqual([]);
  });

  it('RF-609 a kept application proposes nothing for any platform', () => {
    const kept = stackOfferFor(
      { kind: 'keep', languages: ['java'], extensions: [], workbook: false },
      stack,
    );
    for (const layer of kept) {
      expect(layer.platforms.every((each) => each.proposals.length === 0)).toBe(true);
    }
  });

  it('RF-609 the language and runtime layer itself has no platform proposals', () => {
    const offer = stackOfferFor(legacyJavascript, stack);
    expect(offer.find((each) => each.layer === 'language-runtime')?.platforms).toEqual([]);
  });
});
