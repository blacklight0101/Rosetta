import { describe, expect, it } from 'vitest';
import { pinnedSourceOf } from '../../../../src/application/understand/pinned-source.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';

const sha = 'ab'.repeat(20);

describe('RF-125 pinned source of the citations', () => {
  it('RF-125 keeps the owner and the repo in their own fields and pins the scanned commit', () => {
    expect(pinnedSourceOf({ owner: 'acme', repo: 'widgets' }, sha.toUpperCase())).toEqual({
      owner: 'acme',
      repo: 'widgets',
      commitSha: { value: sha },
    });
  });

  it('RF-125 refuses a scan that recorded no valid commit with RST-1202', () => {
    let caught: unknown;
    try {
      pinnedSourceOf({ owner: 'acme', repo: 'widgets' }, 'not-a-sha');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RosettaError);
    expect(caught).toMatchObject({ code: ERROR_CODES.codeMapInvalid });
  });
});
