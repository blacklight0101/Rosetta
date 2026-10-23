import { describe, expect, it } from 'vitest';
import type { AgentRole, LlmRequest } from '../../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { observedHarness } from '../../../../support/observed-harness.js';
import { numCtx, useFakeOllama } from '../../../../support/ollama-harness.js';
import { asRole, refusal, requestOf } from '../../../../support/ollama-prompt-size.js';
import type { RecordingLogger } from '../../../../support/recording-logger.js';

// RF-401, DEC-114, DEC-155, Q-23, Q-48: with `auto` the context grows to fit a prompt that does not
// fit the size that stays in GPU memory; a fixed size and the trained context are never exceeded.
// The recording `context-trained-large` fits at 32768 and is trained on 131072; `context-model-limit`
// is trained on 8192 (ADR-008, no real model).

const start = useFakeOllama();

const warnings = (logger: RecordingLogger) => logger.records.filter((r) => r.level === 'warn');

describe('OllamaProvider with contextTokens auto and a prompt that does not fit', () => {
  it('RF-401 sends the automatic size unchanged when the prompt fits it', async () => {
    const { provider, server, logger } = await start('context-trained-large');

    const response = await provider.complete(requestOf(32_000));

    expect(numCtx(server.chatBodies())).toEqual([32_768]);
    expect(response.metrics?.ollama).toMatchObject({
      contextTokens: 32_768,
      contextSource: 'auto-fit',
    });
    expect(warnings(logger)).toEqual([]);
  });

  it('RF-401 Q-48 sends one doubling, warns once per model and size, and records auto-grown', async () => {
    const { provider: ollama, server, logger } = await start('context-trained-large');
    const { provider, log } = observedHarness({ inner: () => ollama });

    await provider.complete(requestOf(33_000));
    await provider.complete(requestOf(34_000));

    expect(numCtx(server.chatBodies())).toEqual([65_536, 65_536]);
    expect(log.records()[0]).toMatchObject({
      status: 'ok',
      ollama: { contextTokens: 65_536, contextSource: 'auto-grown' },
    });
    expect(warnings(logger)).toHaveLength(1);
    expect(warnings(logger)[0]?.message).toMatch(/CPU/);
    expect(warnings(logger)[0]?.message).toContain('65536');
  });
});

describe('OllamaProvider with contextTokens auto and a prompt that needs several doublings', () => {
  it('RF-401 Q-48 doubles again until the prompt fits, and stops at the trained context', async () => {
    const { provider, server } = await start('context-trained-large');

    const needsFour = await provider.complete(requestOf(70_000));
    const needsAll = await provider.complete(requestOf(130_000));

    expect(numCtx(server.chatBodies())).toEqual([131_072, 131_072]);
    expect(needsFour.metrics?.ollama?.contextSource).toBe('auto-grown');
    expect(needsAll.metrics?.ollama?.contextTokens).toBe(131_072);
  });

  it('RF-401 Q-48 the planner with 16384 output tokens grows past 32768 and the call is sent', async () => {
    const { provider, server } = await start('context-trained-large');
    const planner = asRole(requestOf(17_000, { maxOutputTokens: 16_384 }), 'planner');

    const response = await provider.complete(planner);

    expect(numCtx(server.chatBodies())).toEqual([65_536]);
    expect(response.metrics?.ollama).toMatchObject({
      contextTokens: 65_536,
      contextSource: 'auto-grown',
    });
  });
});

describe('OllamaProvider with contextTokens auto and a prompt beyond the trained context', () => {
  it('RF-401 Q-48 a prompt larger than the trained context fails with RST-1522 and sends nothing', async () => {
    const { provider, server } = await start('context-model-limit');

    const error = await refusal(provider.complete(requestOf(9_000)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.notSent).toBe(true);
    expect(error.message).toMatch(/even the trained context/);
    expect(error.message).toContain('8192');
    expect(error.message).toContain('project settings, the model of the role, Context size');
    expect(server.chatBodies()).toEqual([]);
  });

  it('RF-401 Q-48 a prompt larger than a grown trained context fails and says so', async () => {
    const { provider, server } = await start('context-trained-large');

    const error = await refusal(provider.complete(requestOf(131_000)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.message).toMatch(/even the trained context/);
    expect(error.message).toContain('131072');
    expect(server.chatBodies()).toEqual([]);
  });
});

describe('OllamaProvider with a fixed contextTokens that is too small', () => {
  it('RF-401 Q-48 fails with RST-1522 as before and never grows', async () => {
    const { provider, server } = await start('context-trained-large', { contextTokens: 8_192 });

    const error = await refusal(provider.complete(requestOf(9_000)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.message).not.toMatch(/trained context/);
    expect(error.message).toContain('8192');
    expect(server.chatBodies()).toEqual([]);
    expect(server.bodiesOf('/api/generate')).toEqual([]);
  });
});

describe('OllamaProvider keeps the grown context for the rest of a run (P5-04, EV-21)', () => {
  const inRun = (request: LlmRequest, runId: string, role: AgentRole): LlmRequest => ({
    ...request,
    context: { ...request.context, runId, role },
  });

  it('P5-04 sends 65,536 on every request of a run and its roles, not on another run', async () => {
    const { provider, server } = await start('context-trained-large-run');

    await provider.complete(inRun(requestOf(40_000), 'run-a', 'planner'));
    await provider.complete(inRun(requestOf(1_000), 'run-a', 'planner'));
    await provider.complete(inRun(requestOf(1_000), 'run-a', 'reader'));
    await provider.complete(inRun(requestOf(1_000), 'run-b', 'planner'));

    expect(numCtx(server.chatBodies())).toEqual([65_536, 65_536, 65_536, 32_768]);
  });
});
