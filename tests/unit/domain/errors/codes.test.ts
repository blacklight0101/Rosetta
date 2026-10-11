import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_RANGES, type ErrorCode } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';

const allCodes: readonly ErrorCode[] = Object.values(ERROR_CODES);

function numberOf(code: ErrorCode): number {
  return Number(code.slice('RST-'.length));
}

describe('error-code registry', () => {
  it('RF-007 reserves the codes the design board already shows', () => {
    expect(allCodes).toEqual(
      expect.arrayContaining(['RST-1504', 'RST-1505', 'RST-1903', 'RST-2201', 'RST-2304']),
    );
  });

  it('RF-007 every code has the form RST-nnnn and appears once', () => {
    expect(new Set(allCodes).size).toBe(allCodes.length);
    for (const code of allCodes) {
      expect(code).toMatch(/^RST-\d{4}$/);
    }
  });

  it.each(allCodes)('RF-007 %s lies inside one of the ranges of conventions section 6', (code) => {
    const inRange = Object.values(ERROR_RANGES).some(
      (range) => numberOf(code) >= range.first && numberOf(code) <= range.last,
    );

    expect(inRange).toBe(true);
  });
});

describe('error-code ranges', () => {
  it('RF-007 the ranges are hundreds from RST-1000 to RST-2599 without overlap', () => {
    const ranges = Object.values(ERROR_RANGES);

    expect(ranges).toHaveLength(16);
    expect(ranges[0]).toEqual({ first: 1000, last: 1099 });
    expect(ranges[15]).toEqual({ first: 2500, last: 2599 });
    ranges.forEach((range, index) => {
      expect(range.last - range.first).toBe(99);
      expect(range.first).toBe(1000 + index * 100);
    });
  });
});

describe('error-code descriptions', () => {
  it.each(allCodes)('RF-007 %s carries a plain message and a next step', (code) => {
    const description = describeError(code);

    expect(description.message.length).toBeGreaterThan(10);
    expect(description.nextStep.length).toBeGreaterThan(10);
    expect(description.message).not.toContain('RST-');
  });

  it('RF-007 the messages shown on the design board are kept word for word', () => {
    expect(describeError(ERROR_CODES.githubSourceUnavailable).message).toBe(
      'This repository is private or does not exist. Only public GitHub repositories can be analysed.',
    );
    expect(describeError(ERROR_CODES.invalidCredentials).message).toBe(
      'User name or password is incorrect.',
    );
    expect(describeError(ERROR_CODES.baseUrlRejected).message).toBe(
      'The URL must use https and a public address.',
    );
  });
});
