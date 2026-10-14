import { describe, expect, it } from 'vitest';
import { constructs } from '../../../support/agent-usage.js';

// RF-1104: the scan that tells whether an adapter builds a PublicAddressAgent.

describe('constructs', () => {
  it.each([
    ['a plain construction', 'const agent = new PublicAddressAgent();'],
    ['a construction with options', 'const a = new PublicAddressAgent({ timeoutMs: 1 });'],
    ['a construction inside a method', 'class A { m() { return new PublicAddressAgent(); } }'],
    ['a construction in an argument', 'fetchWith(new PublicAddressAgent());'],
    ['a construction over several lines', 'const a = new\n  PublicAddressAgent(\n);'],
  ])('RF-1104 finds %s', (_label, source) => {
    expect(constructs(source, 'PublicAddressAgent')).toBe(true);
  });

  it.each([
    ['an import only', "import { PublicAddressAgent } from './public-address-agent.js';"],
    ['a mention in a comment', '// new PublicAddressAgent() will be used later'],
    ['a mention in a string', "const text = 'new PublicAddressAgent()';"],
    ['a type position', 'let agent: PublicAddressAgent | undefined;'],
    ['another class', 'const agent = new Agent();'],
    ['a longer name', 'const agent = new PublicAddressAgentFactory();'],
    ['a member of another object', 'const agent = new security.PublicAddressAgent();'],
  ])('RF-1104 does not take %s for a construction', (_label, source) => {
    expect(constructs(source, 'PublicAddressAgent')).toBe(false);
  });
});
