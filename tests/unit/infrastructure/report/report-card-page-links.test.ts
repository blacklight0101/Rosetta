import { describe, expect, it } from 'vitest';
import { commit, hrefsOf, pageOf, textsOf, withClaim } from '../../../support/card-page-helpers.js';
import { plainDetail, shippingCitation } from '../../../support/report-fixtures.js';

// RF-125: the permalinks of the page of a card are built from the source of the run only.

describe('the card page permalinks', () => {
  it('RF-125 links each citation to the exact lines on GitHub at the pinned commit', () => {
    const page = pageOf();

    expect(hrefsOf(page, 'a.permalink')).toEqual([
      `https://github.com/octo/demo/blob/${commit}/Orders/Shipping.cs#L10-L12`,
      `https://github.com/octo/demo/blob/${commit}/Orders/Gifts.cs#L1-L2`,
    ]);
    expect(page.foreignLinks).toEqual([]);
  });

  it('RF-125 encodes the path of the file in the link', () => {
    const page = pageOf(
      withClaim({ citations: [{ ...shippingCitation, path: 'My Orders/a#b?.cs' }] }),
    );

    expect(hrefsOf(page, 'a.permalink')).toEqual([
      `https://github.com/octo/demo/blob/${commit}/My%20Orders/a%23b%3F.cs#L10-L12`,
    ]);
  });

  it('RF-125 builds no link when the run has no source, an address that is not GitHub, or no commit', () => {
    const sources = [
      null,
      { url: 'https://evil.example/octo/demo', commitSha: commit },
      { url: 'https://github.com/octo/demo', commitSha: null },
      { url: 'https://github.com/octo/demo', commitSha: 'main' },
      { url: 'https://github.com/octo/demo/../../x', commitSha: commit },
    ];

    for (const source of sources) {
      const page = pageOf(plainDetail, { source });

      expect(page.document.querySelectorAll('a.permalink')).toHaveLength(0);
      expect(textsOf(page, '.citation-name')).toContain('Orders/Shipping.cs:10-12');
    }
  });
});

describe('the card page permalinks and untrusted text', () => {
  it('RF-125 builds no link for a path that is not inside the repository', () => {
    const page = pageOf(
      withClaim({ citations: [{ ...shippingCitation, path: '../../etc/passwd' }] }),
    );

    expect(page.document.querySelectorAll('a.permalink')).toHaveLength(0);
  });

  it('RF-125 takes the repository and the commit from the source of the run, never from the card text', () => {
    const attacker = 'https://github.com/attacker/repo/blob/deadbeef/x.cs#L1';
    const page = pageOf({
      ...withClaim({
        text: `[proof](${attacker})`,
        reason: 'commit deadbeef0000000000000000000000000000beef of attacker/repo',
      }),
      summary: `See ${attacker}`,
    });

    expect(hrefsOf(page, 'a.permalink')).toEqual([
      `https://github.com/octo/demo/blob/${commit}/Orders/Shipping.cs#L10-L12`,
    ]);
  });
});
