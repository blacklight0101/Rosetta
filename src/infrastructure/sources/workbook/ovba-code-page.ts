// RF-154: the code page of a VBA project (PROJECTCODEPAGE) decides how the module names and the
// source bytes become text. `TextDecoder` knows the encodings below; a code page it does not know
// is decoded as windows-1252, which keeps every byte readable, and the model says so.

const ENCODINGS: Readonly<Record<number, string>> = {
  866: 'ibm866',
  874: 'windows-874',
  932: 'shift_jis',
  936: 'gbk',
  949: 'euc-kr',
  950: 'big5',
  1200: 'utf-16le',
  1250: 'windows-1250',
  1251: 'windows-1251',
  1252: 'windows-1252',
  1253: 'windows-1253',
  1254: 'windows-1254',
  1255: 'windows-1255',
  1256: 'windows-1256',
  1257: 'windows-1257',
  1258: 'windows-1258',
  10000: 'macintosh',
  20866: 'koi8-r',
  65001: 'utf-8',
};

export const FALLBACK_ENCODING = 'windows-1252';

export function encodingFor(codePage: number): string {
  return ENCODINGS[codePage] ?? FALLBACK_ENCODING;
}

/** Decodes without throwing: a byte the encoding cannot map becomes U+FFFD. */
export function decodeText(bytes: Uint8Array, encoding: string): string {
  return new TextDecoder(encoding).decode(bytes);
}
