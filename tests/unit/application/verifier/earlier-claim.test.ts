import { describe, expect, it } from 'vitest';
import { earlierClaimReason } from '../../../../src/application/verifier/earlier-claim.js';

// EV-78, RF-301, P7-22: a claim states what the code does; one that refers to an earlier or a
// rejected claim is rejected without a model call.

describe('a claim that refers to an earlier claim', () => {
  it.each([
    'The table has an Id column, so the earlier claim that no identifier column exists is wrong.',
    'Unlike the previous claim, the handler also validates the total.',
    'This corrects the rejected claim: the retry happens three times.',
    'The first claim was wrong; the method returns early.',
    'As the original claim ENT-003.c2 said, the key is a GUID.',
    'This replaces the earlier draft: the service logs the error.',
  ])('EV-78 is rejected, with the reason: %s', (text) => {
    const reason = earlierClaimReason({ text });

    expect(reason).toMatch(/earlier|another claim/iu);
    expect(reason).toMatch(/states what the code does/iu);
  });

  it.each([
    'The method CreateOrder inserts a row into Orders and returns its Id.',
    'The previous statement of the batch is rolled back when the insert fails.',
    'A claim form is posted to /claims and stored in the Claims table.',
    'The first parameter of the handler is the order number.',
    'The original file name is kept in the OriginalName column.',
  ])('EV-78 is left to the verifier: %s', (text) => {
    expect(earlierClaimReason({ text })).toBeUndefined();
  });
});
