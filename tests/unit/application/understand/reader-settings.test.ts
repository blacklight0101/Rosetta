import { describe, expect, it } from 'vitest';
import type { RoleProvider } from '../../../../src/application/providers/provider-set.js';
import {
  readerParallelism,
  readerTaskSettings,
  readerToolLimits,
} from '../../../../src/application/understand/reader-settings.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';

// RF-201, RF-144, DEC-117: the reader limits come from the project settings, inside their ranges.

const role = (kind: RoleProvider['kind']): RoleProvider => ({
  provider: { complete: () => Promise.reject(new Error('not called')) },
  name: kind,
  kind,
  model: 'm',
  maxOutputTokens: 1024,
  keySource: 'user',
});

describe('reader settings of an understand run', () => {
  it('DEC-117 parallelism and turns stay inside their ranges', () => {
    const base = settingsFor({ reader: { provider: 'openai', model: 'm' } });
    const many = { ...base, agents: { parallelism: 500 } };
    const turns = {
      ...base,
      roles: { ...base.roles, reader: { ...base.roles.reader, maxTurns: 90 } },
    };

    expect(readerParallelism(many)).toBe(8);
    expect(readerTaskSettings(turns, role('openai')).maxTurns).toBe(50);
    expect(readerTaskSettings(base, role('openai'))).toMatchObject({
      model: 'm',
      maxTurns: 12,
      contextTokens: 128_000,
      contextShare: 0.8,
      maxOutputTokens: 1024,
    });
  });

  it('RF-144 a read returns at most scan.excerptMaxLines lines; Ollama has a smaller context', () => {
    const base = settingsFor({ reader: { provider: 'openai', model: 'm' } });

    expect(readerToolLimits(base)).toEqual({ maxReadLines: base.scan.excerptMaxLines });
    expect(readerTaskSettings(base, role('ollama')).contextTokens).toBe(32_768);
  });
});

describe('the context of the reader (Q-57)', () => {
  const hosted = (modelContextTokens: number | undefined): RoleProvider => ({
    ...role('anthropic'),
    ...(modelContextTokens === undefined ? {} : { modelContextTokens }),
  });
  const base = settingsFor({ reader: { provider: 'anthropic', model: 'm' } });

  it('RF-201 a hosted reader runs with the window its model has in the list', () => {
    expect(readerTaskSettings(base, hosted(1_000_000)).contextTokens).toBe(1_000_000);
    expect(readerTaskSettings(base, hosted(1_000_000)).contextShare).toBe(0.8);
  });

  it('RF-201 a hosted reader without a window in the list keeps 128,000 tokens', () => {
    expect(readerTaskSettings(base, hosted(undefined)).contextTokens).toBe(128_000);
  });

  it('RF-201 the number a project sets for the provider wins over the window of the list', () => {
    const existing = base.providers['anthropic'];
    if (existing === undefined) throw new Error('The template has no anthropic provider');
    const providers = { ...base.providers, anthropic: { ...existing, contextTokens: 300_000 } };

    expect(readerTaskSettings({ ...base, providers }, hosted(1_000_000)).contextTokens).toBe(
      300_000,
    );
  });

  it('P3-64 an Ollama reader ignores a window of the list', () => {
    const local: RoleProvider = { ...role('ollama'), modelContextTokens: 1_000_000 };

    expect(readerTaskSettings(base, local).contextTokens).toBe(32_768);
  });
});
