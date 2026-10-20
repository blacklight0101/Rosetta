import { describe, expect, it } from 'vitest';
import { areaLabel } from '../../../web/src/lib/live-run/area-label.js';

// RF-1016, RF-104, data-model.md section 3.1 (P3-62, owner test 2026-10-20): an area tile shows the
// part of the name after the last "/"; the `#1` that ends the name of a part of a large area reads
// "part 1", and the full name stays for the hover and the focus.

describe('RF-1016 the name of an area on a tile', () => {
  it('RF-1016 shows the part after the last "/" and keeps the full name apart', () => {
    expect(areaLabel('Asset_Manager.xlsm/macros')).toEqual({
      text: 'macros',
      full: 'Asset_Manager.xlsm/macros',
      part: undefined,
    });
  });

  it('RF-1016 shows a name without "/" as it is', () => {
    expect(areaLabel('Catalog')).toEqual({ text: 'Catalog', full: 'Catalog', part: undefined });
    expect(areaLabel('(root)').text).toBe('(root)');
  });

  it('RF-104 reads the "#1" of a part of a large area as "part 1"', () => {
    expect(areaLabel('Asset_Manager.xlsm/Inventory#1')).toEqual({
      text: 'Inventory, part 1',
      full: 'Asset_Manager.xlsm/Inventory#1',
      part: 1,
    });
    expect(areaLabel('Models#12').text).toBe('Models, part 12');
  });

  it('RF-104 leaves a "#" that is not a part number in the name', () => {
    expect(areaLabel('C#').text).toBe('C#');
    expect(areaLabel('F#/Core#x').text).toBe('Core#x');
  });

  it('RF-1016 ignores a trailing "/" and falls back to the full name when nothing is left', () => {
    expect(areaLabel('src/Models/').text).toBe('Models');
    expect(areaLabel('/').text).toBe('/');
  });
});
