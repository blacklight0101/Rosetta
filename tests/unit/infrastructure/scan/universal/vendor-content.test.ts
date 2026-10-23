import { describe, expect, it } from 'vitest';
import { isVendoredContent } from '../../../../../src/infrastructure/scan/universal/vendor-content.js';

// RF-104 (P3-112, EV-28): the scan reads a file's head to see that it is a vendored library (its
// header names a known library with a version and a licence) or a generated schema.

const jquery =
  '/*!\n * jQuery JavaScript Library v3.4.1\n * (c) JS Foundation\n * Released under the MIT license\n */\n';
const bootstrap =
  '/*!\n * Bootstrap v3.3.7 (http://getbootstrap.com)\n * Licensed under MIT\n */\n';
const fontAwesome =
  '/*!\n *  Font Awesome 4.7.0 by @davegandy\n *  License - http://fontawesome.io/license (CSS: MIT License)\n */\n';
const own = '// Our checkout helper. Uses jQuery for the cart widget.\nfunction run() {}\n';
const schemaHead = '{ "$schema": "http://json-schema.org/draft-04/schema#", "type": "object" }';

describe('isVendoredContent', () => {
  it('a header naming a known library, a version and a licence is vendored', () => {
    expect(isVendoredContent('Assets/x.js', jquery, 500)).toBe(true);
    expect(isVendoredContent('Assets/y.css', bootstrap, 40)).toBe(true);
    expect(isVendoredContent('Assets/fa.css', fontAwesome, 40)).toBe(true);
  });

  it('own code that only mentions a library is not vendored', () => {
    expect(isVendoredContent('Scripts/app.js', own, 20)).toBe(false);
  });

  it('a library header on a non-script file is ignored', () => {
    expect(isVendoredContent('Docs/notes.md', jquery, 20)).toBe(false);
  });

  it('a large JSON file with a $schema is generated schema; a small one is not', () => {
    expect(isVendoredContent('api/deployment.json', schemaHead, 60_000)).toBe(true);
    expect(isVendoredContent('tsconfig.json', schemaHead, 200)).toBe(false);
    expect(isVendoredContent('api/data.json', '{ "name": "x" }', 60_000)).toBe(false);
  });
});
