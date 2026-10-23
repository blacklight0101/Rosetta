import { describe, expect, it } from 'vitest';
import { isVendoredContent } from '../../../../../src/infrastructure/scan/universal/vendor-content.js';

// P5-19 item 4 (follow-up of P3-112, RF-104): a banner is a library banner only when the library
// name opens the leading comment, and the licence word is required. Synthetic headers.

describe('a vendored banner starts with the library name (P5-19)', () => {
  it.each([
    '// Order form - jQuery 3.6.0 (MIT)\nfunction a() {}\n',
    '// Order form: jQuery v3.6.0, MIT\nfunction a() {}\n',
    '// Tested with jQuery 3.6.0; MIT\nfunction a() {}\n',
    '// Compatible with jQuery 3.6.0 (MIT)\nfunction a() {}\n',
    '// Patched for jQuery 3.6.0 (MIT)\nfunction a() {}\n',
    '// Custom lodash 4.17.21 build wrapper. MIT\nfunction a() {}\n',
  ])('a header that does not start with the library name is not vendored: %j', (header) => {
    expect(isVendoredContent('Scripts/order.js', header, 20)).toBe(false);
  });

  it.each([
    '/*! jQuery v3.6.0 | MIT license */\n',
    '/**\n * @license\n * lodash 4.17.21 <https://lodash.com/>\n * Released under MIT license\n */\n',
    '// Bootstrap v3.3.7\n// Licensed under MIT\n',
  ])('a banner that starts with the library name is vendored: %j', (header) => {
    expect(isVendoredContent('Assets/x.js', header, 20)).toBe(true);
  });
});

describe('a vendored banner needs a licence word (P5-19)', () => {
  it('a name and version without a licence word is not vendored', () => {
    const header = '/*!\n * jQuery JavaScript Library v3.4.1\n * (c) our team\n */\n';

    expect(isVendoredContent('Assets/x.js', header, 20)).toBe(false);
  });
});
