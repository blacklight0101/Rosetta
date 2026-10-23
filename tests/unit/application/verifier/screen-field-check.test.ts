import { describe, expect, it } from 'vitest';
import type { CitedExcerpt } from '../../../../src/application/verifier/cited-lines.js';
import { screenFieldVerdict } from '../../../../src/application/verifier/screen-field-check.js';
import { fieldClaimText } from '../../../../src/domain/cards/screen-claims.js';

// RF-626, RF-301, P3-122, HB-02: a derived "Field X is on the screen" claim is decided by the
// cited lines when they decide it: the name present is Supported, absent is Rejected with a plain
// reason, and a name with nothing to look for goes to the model.

const excerpt = (...lines: string[]): CitedExcerpt[] => [
  { path: 'Asset.aspx', startLine: 1, endLine: lines.length, lines, skipped: false },
];

const claimOf = (name: string, inputKind = 'text', required = false) => ({
  text: fieldClaimText({ name, inputKind, required }),
});

describe('the deterministic check of a screen field claim', () => {
  it.each([
    ['AssetTag', '<asp:TextBox ID="AssetTag" runat="server" />'],
    ['AssetTag', '<input name="asset_tag" />'],
    ['Asset Tag', '<asp:TextBox ID="txtAssetTag" runat="server" />'],
    ['assetTag', '<label>Asset tag</label>'],
    ['Serial', '<input id="SERIAL-number" />'],
  ])('RF-626 %s is Supported by %s', (name, line) => {
    const verdict = screenFieldVerdict(claimOf(name), excerpt('<form>', line));

    expect(verdict?.status).toBe('Supported');
    expect(verdict?.reason).toContain(name);
  });

  it('RF-626 a name that is not in the cited lines is Rejected with a plain reason', () => {
    const verdict = screenFieldVerdict(claimOf('PurchaseDate'), excerpt('<input id="AssetTag" />'));

    expect(verdict).toEqual({
      status: 'Rejected',
      reason: 'The cited lines do not contain the field name PurchaseDate.',
    });
  });

  it('RF-626 a name is not found inside a longer word', () => {
    const verdict = screenFieldVerdict(claimOf('Name'), excerpt('var filename = "x";'));

    expect(verdict?.status).toBe('Rejected');
  });

  it('RF-626 the kind and the required flag of the claim do not change the check', () => {
    const verdict = screenFieldVerdict(
      claimOf('AssetTag', 'dropdown', true),
      excerpt('<select id="AssetTag">'),
    );

    expect(verdict?.status).toBe('Supported');
  });
});

describe('the screen field check leaves to the model what the lines cannot decide', () => {
  it('RF-301 leaves to the model a name with no letter or digit', () => {
    expect(screenFieldVerdict(claimOf('***'), excerpt('<input id="a" />'))).toBeUndefined();
  });

  it('RF-100 leaves to the model lines the scan did not read', () => {
    const skipped: CitedExcerpt[] = [
      { path: 'a.bin', startLine: 1, endLine: 1, lines: ['binary, not sent'], skipped: true },
    ];

    expect(screenFieldVerdict(claimOf('AssetTag'), skipped)).toBeUndefined();
  });

  it.each([
    'Action Save starts the handler Save_Click.',
    'The screen is at the route /Asset.aspx.',
    'Field AssetTag (text, optional) validation: it is required.',
    'The page shows the AssetTag field.',
  ])('RF-301 leaves to the model a claim that is not a field claim: %s', (text) => {
    expect(screenFieldVerdict({ text }, excerpt('AssetTag'))).toBeUndefined();
  });
});
