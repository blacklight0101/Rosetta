import { describe, expect, it } from 'vitest';
import {
  mentions,
  stackTechnologies,
  technologiesNamed,
  traitsOf,
} from '../../../../src/domain/planning/stack-catalogue.js';
import { stackLayers } from '../../../../src/domain/planning/planning-brief.js';

// RF-609: the technology table behind the stack check and the options of the stack records.

describe('stack catalogue', () => {
  it('RF-609 offers at least two technologies with a one-line description for every layer', () => {
    for (const layer of stackLayers) {
      const own = stackTechnologies.filter((tech) => tech.layer === layer);
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
    expect(traitsOf('front-end', 'Razor Pages').has('server-rendered')).toBe(true);
    expect(traitsOf('backend-framework', 'ASP.NET Core Minimal APIs').has('api-only')).toBe(true);
    expect(technologiesNamed('front-end', 'Our own toolkit')).toEqual([]);
  });
});
