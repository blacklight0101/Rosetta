import { describe, expect, it } from 'vitest';
import { marksOf, surfaceOf } from '../../../../src/domain/code-map/area-surface.js';
import type { CodeSymbol } from '../../../../src/domain/code-map/code-map.js';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-260, RF-261, Q-25: the code map marks the areas that hold entry points (flows) or pages,
// forms, views and templates (screens). An area of plain libraries is marked for neither, so it
// costs nothing extra.

const page = (path: string): FileEntry => entry(path, 10, { artefactKinds: ['page'] });
const controller = (path: string): FileEntry => entry(path, 10, { artefactKinds: ['controller'] });
const symbol = (path: string, name: string, kind: CodeSymbol['kind'] = 'class'): CodeSymbol => ({
  path,
  kind,
  name,
  startLine: 1,
  endLine: 5,
});

function mapOf(files: readonly FileEntry[], symbols: readonly CodeSymbol[] = []) {
  return { files, symbols };
}

function areaOf(files: readonly FileEntry[]) {
  return { files: files.map((file) => file.path) };
}

describe('the surface of an area', () => {
  it('RF-261 a page file is a page and, being a page action, an entry point', () => {
    const files = [page('Orders/Checkout.aspx'), entry('Orders/Checkout.aspx.cs')];

    const surface = surfaceOf(areaOf(files), mapOf(files));

    expect(surface).toEqual({
      entryPoints: ['Orders/Checkout.aspx'],
      pages: ['Orders/Checkout.aspx'],
    });
  });

  it('RF-260 a controller is an entry point and not a page', () => {
    const files = [controller('Api/OrdersController.cs')];

    expect(surfaceOf(areaOf(files), mapOf(files))).toEqual({
      entryPoints: ['Api/OrdersController.cs'],
      pages: [],
    });
  });

  it('RF-260 the entry point file of an application is an entry point', () => {
    const files = [entry('Global.asax', 5, { artefactKinds: ['entry-point'] })];

    expect(marksOf(areaOf(files), mapOf(files))).toEqual({ flows: true, screens: false });
  });
});

describe('the entry points of an area by name', () => {
  it.each([
    'InvoiceJob',
    'OrderPlacedHandler',
    'StockConsumer',
    'PaymentListener',
    'NightlyWorker',
  ])('RF-260 a class named %s is a scheduled job or a message handler: an entry point', (name) => {
    const files = [entry('Jobs/Work.cs')];

    const marks = marksOf(areaOf(files), mapOf(files, [symbol('Jobs/Work.cs', name)]));

    expect(marks).toEqual({ flows: true, screens: false });
  });

  it('RF-260 a handler name only counts on a class, not on a property', () => {
    const files = [entry('Jobs/Work.cs')];
    const symbols = [symbol('Jobs/Work.cs', 'RetryHandler', 'property')];

    expect(marksOf(areaOf(files), mapOf(files, symbols))).toEqual({ flows: false, screens: false });
  });
});

describe('the screens of an area', () => {
  it.each(['Controls/Banner.ascx', 'Site.master', 'Views/Cart.razor', 'ui/Cart.vue', 'a/b.xaml'])(
    'RF-261 %s is a view or a template: a screen',
    (path) => {
      const files = [entry(path)];

      expect(marksOf(areaOf(files), mapOf(files)).screens).toBe(true);
    },
  );
});

describe('the area boundary', () => {
  it('Q-25 an area of plain libraries is marked for neither flows nor screens', () => {
    const files = [entry('Services/OrderService.cs'), entry('Services/Prices.cs')];
    const symbols = [symbol('Services/OrderService.cs', 'OrderService')];

    expect(surfaceOf(areaOf(files), mapOf(files, symbols))).toEqual({
      entryPoints: [],
      pages: [],
    });
    expect(marksOf(areaOf(files), mapOf(files, symbols))).toEqual({
      flows: false,
      screens: false,
    });
  });

  it('Q-25 only the files of the area count, not a page of another area', () => {
    const inside = entry('Services/OrderService.cs');
    const outside = page('Orders/Checkout.aspx');

    const marks = marksOf(areaOf([inside]), mapOf([inside, outside]));

    expect(marks).toEqual({ flows: false, screens: false });
  });

  it('RF-105 lists paths in the area order, without repeats', () => {
    const files = [page('A/One.aspx'), page('A/Two.aspx')];
    const symbols = [symbol('A/One.aspx', 'OneJob'), symbol('A/One.aspx', 'OneHandler')];

    expect(surfaceOf(areaOf(files), mapOf(files, symbols)).entryPoints).toEqual([
      'A/One.aspx',
      'A/Two.aspx',
    ]);
  });
});
