import { describe, expect, it } from 'vitest';
import { isAllowedRequestUrl } from '../../e2e/support/request-policy.js';

// RNF-005, ADR-008, P1-13: the browser of an end-to-end test may reach 127.0.0.1 (and the other
// loopback names the unit and integration guard allows) and inline data, nothing else.

describe('e2e request policy', () => {
  it.each([
    'http://127.0.0.1:18080/healthz',
    'http://localhost:18080/',
    'http://[::1]:18080/',
    'ws://127.0.0.1:18080/stream',
    'data:text/plain,ok',
    'blob:http://127.0.0.1:18080/0b9d',
    'about:blank',
  ])('RNF-005 allows %s', (url) => {
    expect(isAllowedRequestUrl(url)).toBe(true);
  });

  it.each([
    'https://example.com/',
    'http://192.168.1.10/',
    'http://127.0.0.1.example.com/',
    'https://api.github.com/repos/octo/demo',
    'ftp://127.0.0.1/file',
    'not a url',
  ])('RNF-005 refuses %s', (url) => {
    expect(isAllowedRequestUrl(url)).toBe(false);
  });
});
