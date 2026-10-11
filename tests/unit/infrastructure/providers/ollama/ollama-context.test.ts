import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import {
  CONTEXT_CEILING,
  CONTEXT_FLOOR,
  contextSettingOf,
  MIN_FIXED_CONTEXT,
} from '../../../../../src/infrastructure/providers/ollama/ollama-context.js';
import { OllamaProvider } from '../../../../../src/infrastructure/providers/ollama/ollama-provider.js';
import {
  residencyOf,
  trainedContextOf,
} from '../../../../../src/infrastructure/providers/ollama/ollama-wire.js';
import { RecordingLogger } from '../../../../support/recording-logger.js';

// RF-401, DEC-114, Q-23: the context-size setting and the parts of /api/show and /api/ps it reads.

const digest = 'aaaa';

describe('Ollama context-size setting', () => {
  it('RF-401 uses the Q-23 defaults: ceiling 32768, floor 4096, a fixed size of at least 1024', () => {
    expect([CONTEXT_CEILING, CONTEXT_FLOOR, MIN_FIXED_CONTEXT]).toEqual([32_768, 4_096, 1_024]);
  });

  it('RF-401 defaults to auto', () => {
    expect(contextSettingOf(undefined)).toBe('auto');
  });

  it.each(['auto', 1_024, 16_384] as const)('RF-401 accepts %s', (value) => {
    expect(contextSettingOf(value)).toBe(value);
  });

  it.each([1_023, 0, -1, 2_048.5, Number.NaN])('RF-401 refuses %s with RST-1514', (value) => {
    expect(() => contextSettingOf(value)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.ollamaContextTokensInvalid }),
    );
  });
});

describe("Ollama's /api/show and /api/ps answers", () => {
  it("RF-401 reads the trained context of the model's own architecture", () => {
    const body = {
      model_info: {
        'general.architecture': 'gemma3',
        'clip.context_length': 512,
        'gemma3.context_length': 131_072,
      },
    };

    expect(trainedContextOf(body)).toEqual({ ok: true, trained: 131_072 });
  });

  it('RF-401 falls back to any *.context_length when the architecture is not named', () => {
    expect(trainedContextOf({ model_info: { 'llama.context_length': 8_192 } })).toEqual({
      ok: true,
      trained: 8_192,
    });
  });

  it('RF-401 a model_info without a context length leaves the trained context unknown', () => {
    expect(trainedContextOf({ model_info: {} })).toEqual({ ok: true, trained: undefined });
  });

  it('RF-401 an answer that is not a /api/show answer is refused', () => {
    expect(trainedContextOf('nope')).toEqual({ ok: false });
  });

  it('RF-401 finds the loaded model by digest and reads its size and GPU size', () => {
    const body = {
      models: [
        { name: 'other:latest', digest: 'bbbb', size: 1, size_vram: 1 },
        { name: 'gemma:latest', digest, size: 9_000, size_vram: 6_000 },
      ],
    };

    expect(residencyOf(body, digest)).toEqual({ size: 9_000, sizeVram: 6_000 });
  });

  it('RF-401 a model that is not loaded has no residency', () => {
    expect(residencyOf({ models: [] }, digest)).toBeUndefined();
    expect(residencyOf('nope', digest)).toBeUndefined();
  });
});

describe('OllamaProvider options', () => {
  it('RF-401 refuses a fixed contextTokens below 1024 with RST-1514 when it is built', () => {
    const build = () =>
      new OllamaProvider({
        baseUrl: 'http://127.0.0.1:11434',
        toolMode: 'native',
        timeoutSeconds: 5,
        maxRetries: 0,
        textProtocolPrompt: '{{tools}}',
        testMode: true,
        logger: new RecordingLogger(),
        contextTokens: 512,
      });

    expect(build).toThrow(
      expect.objectContaining({ code: ERROR_CODES.ollamaContextTokensInvalid }),
    );
  });
});
