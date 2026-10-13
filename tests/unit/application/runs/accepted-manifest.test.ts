import { describe, expect, it } from 'vitest';
import { acceptedManifest } from '../../../../src/application/runs/accepted-manifest.js';
import { parseProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { sampleProject, settingsWith } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-003, RF-126, RNF-004: the manifest written when a run is accepted holds the Rosetta version,
// stage, options, source, the roles and caps of the project's settings. Nothing is known yet of the
// commit, the code map, the prompts or the spend.

function projectWith(changes: Record<string, unknown>) {
  const parsed = parseProjectSettings(settingsWith(changes));
  if (!parsed.ok) throw new Error('The settings were refused');
  return sampleProject({
    sourceUrl: 'https://github.com/dotnet-architecture/eshopmodernizing',
    ref: 'main',
    subpath: 'src/Web',
    settings: parsed.value,
  });
}

describe('acceptedManifest', () => {
  it('RF-003 holds the version, stage, options and run id, with no start, end or end state', () => {
    const run = sampleRun({ runKey: '20261012-100000-scan', stage: 'scan' });

    const manifest = acceptedManifest({
      run,
      project: projectWith({}),
      rosettaVersion: '1.2.3-test',
      options: { areas: ['catalog'] },
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      runId: '20261012-100000-scan',
      stage: 'scan',
      rosettaVersion: '1.2.3-test',
      options: { areas: ['catalog'] },
      startedAt: null,
      endedAt: null,
      endState: null,
      resumedFrom: null,
      codemapHash: null,
    });
  });

  it('RF-126 holds the repository URL, owner, repository, ref and subpath, and no commit yet', () => {
    const manifest = acceptedManifest({
      run: sampleRun(),
      project: projectWith({}),
      rosettaVersion: '1.2.3-test',
      options: {},
    });

    expect(manifest.source).toEqual({
      url: 'https://github.com/dotnet-architecture/eshopmodernizing',
      owner: 'dotnet-architecture',
      repo: 'eshopmodernizing',
      ref: 'main',
      subpath: 'src/Web',
      commitSha: null,
      snapshotHash: null,
    });
  });
});

describe('acceptedManifest context', () => {
  it('RF-401 holds a fixed Ollama context size of the role provider (DEC-114)', () => {
    const manifest = acceptedManifest({
      run: sampleRun(),
      project: projectWith({ 'providers.ollama.contextTokens': 8192 }),
      rosettaVersion: '1.2.3-test',
      options: {},
    });

    expect(manifest.roles['reader']).toMatchObject({ contextTokens: 8192, contextSource: 'fixed' });
  });

  it('RF-401 leaves an auto context size unknown until the first call answers', () => {
    const manifest = acceptedManifest({
      run: sampleRun(),
      project: projectWith({ 'providers.ollama.contextTokens': 'auto' }),
      rosettaVersion: '1.2.3-test',
      options: {},
    });

    expect(manifest.roles['reader']).toMatchObject({ contextTokens: null, contextSource: null });
  });
});

describe('acceptedManifest roles', () => {
  it('RNF-004 holds the provider kind, model and parameters of every role', () => {
    const manifest = acceptedManifest({
      run: sampleRun(),
      project: projectWith({
        'roles.reader.model': 'reader-model',
        'roles.reader.temperature': 0.2,
        'roles.reader.maxTurns': 9,
        'roles.verifier.provider': 'openai',
      }),
      rosettaVersion: '1.2.3-test',
      options: {},
    });

    expect(manifest.roles['reader']).toEqual({
      provider: 'ollama',
      kind: 'ollama',
      model: 'reader-model',
      modelVersion: null,
      modelDigest: null,
      contextTokens: null,
      contextSource: null,
      toolMode: 'native',
      maxOutputTokens: 4096,
      temperature: 0.2,
      maxTurns: 9,
    });
    expect(manifest.roles['verifier']).toMatchObject({ provider: 'openai', kind: 'openai' });
    expect(Object.keys(manifest.roles)).toEqual(['reader', 'verifier', 'planner', 'summariser']);
  });
});

describe('acceptedManifest caps and security', () => {
  it('RF-003 holds the caps in force: the run caps and the role caps that are set', () => {
    const manifest = acceptedManifest({
      run: sampleRun(),
      project: projectWith({
        'budget.run.maxCostMicros': 250_000,
        'budget.roles': { reader: { maxCostMicros: 100_000 } },
      }),
      rosettaVersion: '1.2.3-test',
      options: {},
    });

    expect(manifest.caps).toEqual({
      run: { maxCostMicros: 250_000, maxTokens: 2_000_000 },
      roles: { reader: { maxCostMicros: 100_000, maxTokens: null } },
    });
  });

  it('RF-147 holds the lifted deny patterns, and zero counts before anything ran', () => {
    const manifest = acceptedManifest({
      run: sampleRun(),
      project: projectWith({ 'scan.allowDenied': ['*.pem'] }),
      rosettaVersion: '1.2.3-test',
      options: {},
    });

    expect(manifest.security).toEqual({
      deniedReads: 0,
      refusedRequests: 0,
      skippedLinks: 0,
      blockedCalls: 0,
      allowDenied: ['*.pem'],
    });
    expect(manifest.totals).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      costMicros: 0,
      calls: 0,
    });
    expect(manifest.agentTasks).toEqual([]);
  });
});
