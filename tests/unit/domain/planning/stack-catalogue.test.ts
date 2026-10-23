import { describe, expect, it } from 'vitest';
import { stackLayers } from '../../../../src/domain/planning/planning-brief.js';
import {
  mentions,
  technologiesNamed,
  traitsOf,
} from '../../../../src/domain/planning/stack-catalogue.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-609: the technology table of the shipped catalogue behind the stack check.

const technologies = shippedCatalogue.stack.technologies;

describe('stack catalogue', () => {
  it('RF-609 offers at least two technologies with a one-line description for every layer', () => {
    for (const layer of stackLayers) {
      const own = technologies.filter((tech) => tech.layer === layer);
      expect(own.length).toBeGreaterThanOrEqual(2);
      for (const tech of own) expect(tech.description).not.toContain('\n');
    }
  });

  it('RF-609 matches whole words only', () => {
    expect(mentions('Java 21', 'java')).toBe(true);
    expect(mentions('JavaScript', 'java')).toBe(false);
    expect(mentions('Razor Pages (.NET 8)', '.net')).toBe(true);
  });

  it('RF-609 reads the traits of a free-text choice and nothing from an unknown one', () => {
    expect(traitsOf(technologies, 'front-end', 'Razor Pages').has('server-rendered')).toBe(true);
    const minimal = traitsOf(technologies, 'backend-framework', 'ASP.NET Core Minimal APIs');
    expect(minimal.has('api-only')).toBe(true);
    expect(technologiesNamed(technologies, 'front-end', 'Our own toolkit')).toEqual([]);
  });
});
