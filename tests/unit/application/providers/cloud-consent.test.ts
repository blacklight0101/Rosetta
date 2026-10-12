import { describe, expect, it } from 'vitest';
import { needsCloudConsent } from '../../../../src/application/providers/cloud-consent.js';

// RF-143, ADR-006, DEC-16: code may leave the machine without the run's consent only towards the
// fake or an Ollama server on this machine (loopback or the Docker host gateway).

describe('cloud consent for cloud providers', () => {
  it.each(['openai', 'openai-compatible', 'anthropic'] as const)(
    'RF-143 asks for consent before code goes to a %s provider',
    (kind) => {
      expect(needsCloudConsent({ kind, endpointHost: 'localhost' })).toBe(true);
    },
  );

  it('RF-143 needs no consent for the fake provider', () => {
    expect(needsCloudConsent({ kind: 'fake', endpointHost: 'fake.test' })).toBe(false);
  });
});

describe('cloud consent for Ollama', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    '127.0.0.1',
    '127.8.9.10',
    '::1',
    '[::1]',
    'host.docker.internal',
  ])('RF-143 needs no consent for Ollama on this machine at %s', (endpointHost) => {
    expect(needsCloudConsent({ kind: 'ollama', endpointHost })).toBe(false);
  });

  it.each([
    'gpu-box.lan',
    '10.0.0.5',
    '192.168.1.20',
    'ollama.example.com',
    '127.0.0.1.example.com',
    'localhost.example.com',
    '128.0.0.1',
    '',
  ])('RF-143 asks for consent before code goes to Ollama at %j', (endpointHost) => {
    expect(needsCloudConsent({ kind: 'ollama', endpointHost })).toBe(true);
  });
});
