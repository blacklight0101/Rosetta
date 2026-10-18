// FAKE SECRETS ONLY (RNF-003). The fake values of the P2-43 shapes (RF-141), built at run time from
// harmless pieces such as "FAKE0", so the repository holds no secret-like literal.

import type { SecretKind } from '../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from './fake-value.js';

export interface CoverageCase {
  readonly name: string;
  readonly kind: SecretKind;
  readonly text: string;
  readonly masked: string;
  /** The fake values that must never appear after masking. */
  readonly secrets: readonly string[];
}

export const f = fakeValue;
export const token = `Tk${f(20)}`;
export const shortToken = `Tk${f(8)}`;
export const secret = `Sc${f(20)}`;
export const password = `Pw${f(14)}`;
export const hex = 'face0'.repeat(7);
export const sig = `Sg${f(30)}%3D`;
export const jwt = [`eyJ${f(15)}`, `eyJ${f(20)}`, f(25)].join('.');
export const basic = Buffer.from(`${f(8)}user:${f(8)}pass0`).toString('base64');
export const slack = `${['xox', 'b'].join('')}-${f(12)}-${f(24)}`;
export const sendGrid = `SG.${f(22)}.${f(43)}`;
export const stripe = ['whsec', f(32)].join('_');
export const twilio = `SK${'face0'.repeat(6)}fa`;
export const google = ['AI', 'za'].join('') + f(35);
export const dashed = (name: string): string => ['-', '-', name].join('');
export const apiKeyName = ['api', 'key'].join('_');

export function one(
  name: string,
  kind: SecretKind,
  [text, masked]: readonly [string, string],
  ...secrets: readonly string[]
): CoverageCase {
  return { name, kind, text, masked, secrets };
}
