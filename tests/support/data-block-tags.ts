// RF-145, ADR-013: fixed data-block tags for tests, so rendered blocks stay stable. A real tag is
// 24 characters of lower-case base32 (a-z, 2-7) from the IdGenerator port; these have that shape.

export const TAG = 'k7q2mz4xrwbn5tjd3hpv6cya';
export const OTHER_TAG = 'bbbbccccddddeeeeffffgggg';

/** The opening line of a block with this tag and header JSON. */
export function headerOf(tag: string, json: string): string {
  return `<<<ROSETTA-DATA ${tag} ${json}>>>`;
}

/** The closing line of the block with this tag. */
export function footerOf(tag: string): string {
  return `<<<END ROSETTA-DATA ${tag}>>>`;
}

/** The tag of the opening line of a rendered block, or '' when the line has none. */
export function tagOf(content: string): string {
  return /^<<<ROSETTA-DATA ([a-z2-7]+) \{/.exec(content)?.[1] ?? '';
}
