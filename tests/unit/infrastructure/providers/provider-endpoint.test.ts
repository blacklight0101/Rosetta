import { describe, expect, it } from 'vitest';
import { needsCloudConsent } from '../../../../src/application/providers/cloud-consent.js';
import { endpointOf } from '../../../../src/infrastructure/providers/provider-endpoint.js';

// RF-143, DEC-118, P1-28 note: the host the egress guard judges and the URL the adapter connects to
// come from one parse of one URL, so they cannot disagree.

function needsConsent(url: string): boolean {
  const endpoint = endpointOf(url);
  if (!endpoint.ok) throw new Error(`${url} did not parse`);
  return needsCloudConsent({ kind: 'ollama', endpointHost: endpoint.value.host });
}

describe('endpointOf', () => {
  it('RF-143 gives the guard the host the adapter connects to, not the user-info before it', () => {
    const endpoint = endpointOf('http://localhost@evil.example:11434');

    expect(endpoint).toEqual({
      ok: true,
      value: { baseUrl: 'http://evil.example:11434', host: 'evil.example' },
    });
  });

  it('RF-143 treats an Ollama server at user-info localhost@evil as needing the consent', () => {
    expect(needsConsent('http://localhost@evil.example:11434')).toBe(true);
  });

  it.each([
    'http://localhost:11434',
    'http://127.0.0.1:11434',
    'http://127.12.0.9:11434',
    'http://[::1]:11434',
    'http://host.docker.internal:11434',
    'http://HOST.DOCKER.INTERNAL:11434',
  ])('DEC-118 counts %s as this machine', (url) => {
    expect(needsConsent(url)).toBe(false);
  });
});

describe('endpointOf: other hosts and URL clean-up', () => {
  it.each([
    'http://192.168.1.20:11434',
    'http://ollama.internal:11434',
    'http://localhost.evil.example:11434',
    'http://127.0.0.1.evil.example:11434',
  ])('DEC-118 counts %s as another host that needs the run consent', (url) => {
    expect(needsConsent(url)).toBe(true);
  });

  it('RF-143 drops credentials and the query from the URL the adapter connects to, and keeps the path', () => {
    const endpoint = endpointOf('http://user:pa55@host.docker.internal:11434/some/path?x=1');

    expect(endpoint).toEqual({
      ok: true,
      value: {
        baseUrl: 'http://host.docker.internal:11434/some/path',
        host: 'host.docker.internal',
      },
    });
  });

  it('RF-143 leaves the default port out, keeps the path and keeps an IPv6 host in brackets', () => {
    expect(endpointOf('https://api.example.com:443/v1')).toEqual({
      ok: true,
      value: { baseUrl: 'https://api.example.com/v1', host: 'api.example.com' },
    });
    expect(endpointOf('http://[::1]:11434')).toEqual({
      ok: true,
      value: { baseUrl: 'http://[::1]:11434', host: '[::1]' },
    });
  });

  it.each(['not a url', '', 'ftp://host/', 'file:///etc/passwd'])(
    'RF-143 refuses %j, which is not an http(s) URL',
    (text) => {
      expect(endpointOf(text).ok).toBe(false);
    },
  );
});
