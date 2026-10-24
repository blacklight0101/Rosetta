import type { PageMarkup } from '../../../../domain/cards/page-markup.js';

// P5-31: stub until the markup reader is written.
export function webFormsMarkup(_path: string, _text: string): PageMarkup | undefined {
  return _path === '' && _text === ''
    ? { path: '', route: 'file', page: { startLine: 1, endLine: 1 }, elements: [] }
    : undefined;
}
