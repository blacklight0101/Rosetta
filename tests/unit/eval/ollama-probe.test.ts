import { describe, expect, it } from 'vitest';
import { probeOllama, pullCommands, type Fetch } from '../../../eval/spike/ollama-probe.js';

// Q-04, Q-10, RF-401, ADR-008: the spike checks Ollama before it runs and never downloads a model.

function answering(body: unknown): { fetch: Fetch; urls: string[] } {
  const urls: string[] = [];
  const fetch: Fetch = (url) => {
    urls.push(url);
    return Promise.resolve(Response.json(body));
  };
  return { fetch, urls };
}

const refusing: Fetch = () => Promise.reject(new Error('connect ECONNREFUSED'));

describe('Ollama probe', () => {
  it('Q-04 a server that is not running is refused with the command that starts it', async () => {
    const probe = await probeOllama('http://127.0.0.1:11434', refusing);

    expect(probe.ok).toBe(false);
    expect(!probe.ok && probe.message).toContain('ollama serve');
    expect(!probe.ok && probe.message).toContain('ROSETTA_OLLAMA_URL');
  });

  it('Q-04 lists the models Ollama has pulled', async () => {
    const { fetch, urls } = answering({ models: [{ name: 'gemma4:e4b' }, { name: 'qwen3:8b' }] });

    const probe = await probeOllama('http://localhost:11434/', fetch);

    expect(probe).toEqual({
      ok: true,
      baseUrl: 'http://localhost:11434',
      pulled: ['gemma4:e4b', 'qwen3:8b'],
    });
    expect(urls).toEqual(['http://localhost:11434/api/tags']);
  });

  it('DEC-118 an Ollama on another machine is refused without a request', async () => {
    const { fetch, urls } = answering({ models: [] });

    const probe = await probeOllama('http://ollama.example.com:11434', fetch);

    expect(probe.ok).toBe(false);
    expect(urls).toEqual([]);
  });
});

describe('Ollama probe host and request', () => {
  it.each(['http://127.evil.com:11434', 'http://127.0.0.1.evil.com:11434'])(
    'DEC-118 the look-alike host %s is refused without a request',
    async (url) => {
      const { fetch, urls } = answering({ models: [] });

      const probe = await probeOllama(url, fetch);

      expect(probe.ok).toBe(false);
      expect(urls).toEqual([]);
    },
  );

  it('Q-04 the tags request does not follow redirects', async () => {
    const inits: RequestInit[] = [];
    const fetch: Fetch = (_url, init) => {
      inits.push(init);
      return Promise.resolve(Response.json({ models: [] }));
    };

    await probeOllama('http://127.0.0.1:11434', fetch);

    expect(inits[0]?.redirect).toBe('error');
  });

  it('Q-04 an answer of an unknown form is refused', async () => {
    const probe = await probeOllama('http://127.0.0.1:11434', answering({ nope: 1 }).fetch);

    expect(probe.ok).toBe(false);
  });

  it('Q-04 names an ollama pull command for each candidate that is not pulled', () => {
    expect(pullCommands(['a:8b', 'b:7b', 'c'], ['a:8b', 'c:latest'])).toEqual(['ollama pull b:7b']);
  });
});
