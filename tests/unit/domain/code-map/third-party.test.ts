import { describe, expect, it } from 'vitest';
import type { Area } from '../../../../src/domain/code-map/area.js';
import {
  isThirdPartyFile,
  thirdPartyAreaNames,
} from '../../../../src/domain/code-map/third-party.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-104, RF-1001 (P1-147): the code map marks the areas that consist only of vendored or minified
// files as third-party, so the start page leaves them unticked. The rule is conservative: a file
// is third-party only when its name, its folder or its shape says so.

/** A file of `lines` lines and about `charactersPerLine` characters on each. */
const shaped = (path: string, lines: number, charactersPerLine: number) =>
  entry(path, Math.ceil((lines * charactersPerLine) / 4), { lines });

const thirdPartyFiles = [
  'Scripts/app.min.js',
  'css/site.MIN.css',
  'wwwroot/js/chart.min.js',
  'Scripts/jquery-3.4.1.js',
  'Scripts/jquery.validate.unobtrusive.js',
  'Scripts/bootstrap.bundle.js',
  'Scripts/modernizr-2.8.3.js',
  'Scripts/respond.js',
  'Scripts/MicrosoftAjax.js',
  'Scripts/MicrosoftMvcValidation.js',
  'Scripts/esm/popper.js',
  'Scripts/umd/popper-utils.js',
  'Scripts/_references.js',
  'Scripts/jquery-3.3.1.min.map',
  'Scripts/jquery-3.3.1.slim.min.js',
  'Scripts/jquery.validate.min.js',
  'Scripts/respond.matchmedia.addListener.min.js',
  'Scripts/bootstrap.js.map',
  'Scripts/bootstrap.bundle.min.js.map',
  'Scripts/WebForms/Menu.js',
  'Scripts/WebForms/WebUIValidation.js',
  'Scripts/WebForms/MSAjax/MicrosoftAjaxWebForms.js',
  'src/vendor/acme/site.css',
  'Scripts/WebForms/WebForms.js',
  'Scripts/WebForms/MSAjax/MicrosoftAjaxCore.js',
  'src/vendor/acme/thing.js',
  'web/node_modules/left-pad/index.js',
  'bower_components/x/x.js',
  'wwwroot/lib/jquery/dist/jquery.js',
  'wwwroot/lib/bootstrap/dist/js/bootstrap.js',
  'Content/bootstrap-grid.css',
  'Content/bootstrap-grid.min.css',
  'Content/bootstrap-grid.css.map',
  'Content/bootstrap-grid.min.css.map',
  'Content/bootstrap-reboot.css',
  'Content/bootstrap-reboot.min.css',
  'Content/bootstrap-reboot.css.map',
  'Content/bootstrap-reboot.min.css.map',
  'Content/bootstrap-utilities.css',
  'Content/bootstrap-utilities.min.css',
  'Content/bootstrap-utilities.css.map',
  'Content/bootstrap-utilities.min.css.map',
  'Scripts/bootstrap-grid.min.css',
];

const ownFiles = [
  'Scripts/site.js',
  'Scripts/checkout.js',
  'Scripts/respondents.js',
  'Controllers/HomeController.cs',
  'src/minimal.js',
  'src/app.minify.js',
  'lib/Billing/Invoice.cs',
  'lib/helpers.js',
  'wwwroot/lib/site-helpers.js',
  'Catalog/Edit.aspx.cs',
  'docs/vendor-notes.md',
  'jquery-notes/readme.js',
  'web/webforms.js',
  'Content/Site.css',
  'Content/bootstrap-grid-custom.css',
  'Domain/Vendor/Vendor.cs',
  'Procurement/Vendor/VendorService.cs',
  'vendor/acme/Thing.cs',
  'node_modules/pkg/README.md',
  'Scripts/angularApp.js',
  'Scripts/d3-charts.js',
  'lib/moment-helpers.js',
  'Scripts/jquery-helpers.js',
  'Scripts/bootstrap-theme-custom.js',
  'Scripts/jquery.cs',
  'lib/jquery/Notes.md',
  'Scripts/WebForms/Custom.js',
  'Scripts/WebForms/Readme.md',
];

describe('isThirdPartyFile by name', () => {
  it.each(thirdPartyFiles)('RF-104 %s is third-party', (path) => {
    expect(isThirdPartyFile(entry(path))).toBe(true);
  });

  it.each(ownFiles)('RF-104 %s is the team own file', (path) => {
    expect(isThirdPartyFile(entry(path))).toBe(false);
  });
});

describe('isThirdPartyFile by shape', () => {
  it('RF-104 a file whose lines average over 500 characters is third-party', () => {
    expect(isThirdPartyFile(shaped('src/bundle.js', 3, 4000))).toBe(true);
    expect(isThirdPartyFile(shaped('src/data.js', 1, 501))).toBe(true);
  });

  it('RF-104 a file whose lines average 500 characters or fewer is not', () => {
    expect(isThirdPartyFile(shaped('src/long-lines.js', 10, 500))).toBe(false);
    expect(isThirdPartyFile(shaped('src/normal.js', 200, 40))).toBe(false);
  });

  it('RF-104 a skipped file has no lines to average and is not third-party', () => {
    expect(isThirdPartyFile(entry('logo.bin', 0, { lines: 0, skipped: 'binary' }))).toBe(false);
  });
});

function areaOf(name: string, paths: readonly string[], tokens: number): Area {
  return {
    name,
    files: [...paths].sort(),
    estimatedTokens: tokens,
    mapLevel: 'coarse',
    origin: 'folder',
  };
}

describe('thirdPartyAreaNames', () => {
  const vendored = entry('Scripts/jquery-3.4.1.js', 100);
  const minified = entry('Scripts/app.min.js', 50);
  const own = entry('Scripts/site.js', 20);
  const files = [vendored, minified, own, entry('Catalog/List.aspx.cs', 30)];

  it('RF-1001 names the areas whose every file is third-party', () => {
    const areas = [
      areaOf('Scripts#1', [vendored.path, minified.path], 150),
      areaOf('Catalog', ['Catalog/List.aspx.cs'], 30),
    ];

    expect(thirdPartyAreaNames({ files, areas })).toEqual(new Set(['Scripts#1']));
  });

  it('RF-1001 an area that mixes a team file with vendored ones is not marked', () => {
    const areas = [areaOf('Scripts', [vendored.path, minified.path, own.path], 170)];

    expect(thirdPartyAreaNames({ files, areas })).toEqual(new Set());
  });

  it('RF-1001 an area with no files in the list is not marked', () => {
    expect(thirdPartyAreaNames({ files: [], areas: [areaOf('Ghost', [], 0)] })).toEqual(new Set());
  });
});
