import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuildMethod } from '../../src/domain/planning/build-method.js';
import { loadRecording } from '../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness } from './plan-harness.js';
import { singleFileCards } from './single-file-plan-cards.js';

// RF-612, RF-639..RF-643, ADR-008, P6-12: a plan run of a single-file application with agents
// building. The understand run is seeded and the planner replays
// tests/recordings/fake/planner-single-file.json, so no provider is called.

export interface MethodRun {
  readonly files: Readonly<Record<string, string>>;
  readonly endState: string | null;
  /** Every request the planner sent to the fake provider. */
  readonly providers: readonly string[];
}

/** The agent tool and models the journey chooses; Claude Code takes its default aliases. */
export const claudeCodeMethod: BuildMethod = {
  aiAssisted: true,
  agentTool: { kind: 'claude-code' },
};
export const codexMethod: BuildMethod = {
  aiAssisted: true,
  agentTool: { kind: 'codex' },
  models: { smallest: 'gpt-small', middle: 'gpt-mid', largest: 'gpt-large' },
};

/** Runs the plan for the bill splitter with this build method and returns its package. */
export async function singleFileRun(buildMethod: BuildMethod): Promise<MethodRun> {
  const dataDir = await mkdtemp(join(tmpdir(), 'rosetta-method-e2e-'));
  try {
    const recording = await loadRecording(
      join('tests', 'recordings', 'fake', 'planner-single-file.json'),
    );
    const h = await createPlanHarness(dataDir, recording);
    await h.understandRun({ cards: singleFileCards(), questions: [] });
    await h.saveBrief({ buildMethod });
    const run = await h.plan();
    return {
      files: await h.handoffOf(run),
      endState: run.endState,
      providers: h.providers.requests().map((request) => request.context.agentTaskId),
    };
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}
