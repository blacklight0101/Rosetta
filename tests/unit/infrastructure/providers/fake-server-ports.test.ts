import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { isFakeServerPort } from '../../../../src/infrastructure/providers/fake-server-ports.js';
import { refuseRealProviderInTests } from '../../../../src/infrastructure/providers/real-provider-guard.js';
import { closedLoopbackUrl, releaseClosedLoopbackUrls } from '../../../support/fake-http-server.js';
import {
  registerFakeServerPort,
  releaseFakeServerPort,
} from '../../../support/fake-server-registration.js';

// RNF-005, ADR-008: the real-provider guard trusts only a port that a test registered.

const port = 45_999;

afterEach(() => {
  releaseFakeServerPort(port);
  releaseClosedLoopbackUrls();
});

describe('fake server ports', () => {
  it('RNF-005 a registered port is trusted until it is released', () => {
    expect(isFakeServerPort(port)).toBe(false);

    registerFakeServerPort(port);
    expect(isFakeServerPort(port)).toBe(true);

    releaseFakeServerPort(port);
    expect(isFakeServerPort(port)).toBe(false);
  });

  it('RNF-005 the port of a closed loopback URL is trusted until the test releases it', async () => {
    const baseUrl = await closedLoopbackUrl();

    expect(() => {
      refuseRealProviderInTests({ testMode: true, baseUrl });
    }).not.toThrow();

    releaseClosedLoopbackUrls();

    expect(() => {
      refuseRealProviderInTests({ testMode: true, baseUrl });
    }).toThrow(expect.objectContaining({ code: ERROR_CODES.realProviderRefusedInTests }));
  });
});
