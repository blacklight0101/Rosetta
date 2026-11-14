import { describe, expect, it } from 'vitest';
import {
  isGeneratedOrDescriptor,
  LinesRead,
  readableFilesOf,
} from '../../../../src/application/lab/targets/tool-turn-reads.js';

// RF-1410: the files and lines of a reader case as the run's read gate counts them.

const files = [
  { path: 'shop/Orders.cs', language: 'csharp', lines: 120 },
  { path: 'shop/Pay.cs', language: 'csharp', lines: 40 },
  { path: 'shop/logo.bin', language: 'unknown', skipped: 'binary' },
  { path: 'shop/Twin.cs', language: 'csharp', lines: 10 },
  { path: 'shop/twin.cs', language: 'csharp', lines: 10 },
  { path: 'shop/Scripts/jquery.min.js', language: 'javascript', lines: 5 },
];

describe('the readable files of a case', () => {
  it('RF-1410 resolves a path as the code map does: exact, else the one file that differs in letter case', () => {
    const readable = readableFilesOf(files);

    expect(readable.resolve('shop/Orders.cs')?.path).toBe('shop/Orders.cs');
    expect(readable.resolve('Shop/orders.CS')?.path).toBe('shop/Orders.cs');
    expect(readable.resolve('shop/Twin.cs')?.path).toBe('shop/Twin.cs');
    expect(readable.resolve('SHOP/TWIN.CS')).toBeUndefined();
    expect(readable.resolve('shop/logo.bin')).toBeUndefined();
    expect(readable.resolve('shop/Missing.cs')).toBeUndefined();
  });

  it('RF-1410 counts the lines of the readable files that are not third-party, for the share', () => {
    expect(readableFilesOf(files).shareLines).toBe(120 + 40 + 10 + 10);
  });

  it('RF-1410 says whether the case lists a readable file that is not generated or a descriptor', () => {
    const descriptors = [{ path: 'a/packages.config', language: 'xml', lines: 9 }];

    expect(readableFilesOf(files).hasPlainFile).toBe(true);
    expect(readableFilesOf(descriptors).hasPlainFile).toBe(false);
  });
});

describe('generated and descriptor files', () => {
  it.each([
    'a/Views/CatalogView.Designer.cs',
    'a/Form1.designer.vb',
    'a/Service References/Catalog/Reference.cs',
    'a/CatalogService.wsdl',
    'a/CatalogService1.xsd',
    'a/Reference.svcmap',
    'a/configuration91.svcinfo',
    'a/Resources.resx',
    'a/eShopWinForms.csproj',
    'a/App.sfproj',
    'a/eShop.sln',
    'a/Properties/PublishProfiles/Cloud.pubxml',
    'a/packages.config',
    'a/Properties/AssemblyInfo.cs',
  ])('RF-1410 counts %s as generated or a descriptor', (path) => {
    expect(isGeneratedOrDescriptor(path)).toBe(true);
  });

  it.each(['a/Controllers/CatalogController.cs', 'a/Web.config', 'a/Global.asax.cs'])(
    'RF-1410 does not count %s',
    (path) => {
      expect(isGeneratedOrDescriptor(path)).toBe(false);
    },
  );
});

describe('the lines read', () => {
  it('RF-1410 counts only lines not read before, cut to the file and to 400 lines a read', () => {
    const read = new LinesRead();
    read.add('a.cs', 10, 49, 1000);

    expect(read.add('a.cs', 11, 50, 1000)).toBe(1);
    expect(read.add('a.cs', 100, 2000, 1000)).toBe(400);
    expect(read.add('b.cs', 1, 99, 30)).toBe(30);
    expect(read.add('b.cs', 1, 30, 30)).toBe(0);
  });
});
