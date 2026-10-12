import { describe, expect, it } from 'vitest';
import {
  bareHost,
  isPublicAddress,
} from '../../../../src/infrastructure/security/public-address.js';

// RF-1104, DEC-112, threat model TB5 (SSRF): an OpenAI-compatible base URL must not reach a
// private, loopback, link-local, shared (CGNAT), unique-local, IPv4-mapped or cloud metadata
// address. Only addresses outside every special-purpose range count as public.

describe('isPublicAddress', () => {
  it.each([
    ['0.0.0.0', 'this network'],
    ['10.1.2.3', 'private 10/8'],
    ['100.64.0.1', 'shared address space (CGNAT)'],
    ['100.100.100.200', 'a cloud metadata address inside CGNAT'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['169.254.169.254', 'link-local and the cloud metadata address'],
    ['168.63.129.16', 'a cloud platform metadata address'],
    ['172.16.0.1', 'private 172.16/12'],
    ['172.31.255.255', 'private 172.16/12'],
    ['192.0.0.192', 'IETF protocol assignments (a metadata address)'],
    ['192.0.2.10', 'documentation'],
    ['192.168.1.20', 'private 192.168/16'],
    ['198.18.0.1', 'benchmarking'],
    ['203.0.113.7', 'documentation'],
    ['224.0.0.1', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
    ['::', 'unspecified'],
    ['::1', 'IPv6 loopback'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:8.8.8.8', 'IPv4-mapped, refused whatever it maps to'],
    ['::ffff:7f00:1', 'IPv4-mapped in hexadecimal form'],
    ['::127.0.0.1', 'IPv4-compatible'],
    ['64:ff9b::a00:1', 'NAT64 to a private address'],
    ['2001:db8::1', 'documentation'],
    ['2001::1', 'Teredo'],
    ['2002:a00:1::1', '6to4'],
    ['fc00::1', 'unique local'],
    ['fd00:ec2::254', 'unique local and a cloud metadata address'],
    ['fe80::1', 'IPv6 link-local'],
    ['fec0::1', 'site-local'],
    ['ff02::1', 'IPv6 multicast'],
    ['not-an-address', 'not an IP address'],
    ['', 'empty'],
  ])('RF-1104 %s is not public (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.215.14', '172.32.0.1', '2606:4700:4700::1111'])(
    'RF-1104 %s is public',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe('bareHost', () => {
  it.each([
    ['[::1]', '::1'],
    ['[FD00::1]', 'fd00::1'],
    ['LLM.Example.com', 'llm.example.com'],
    ['llm.example.com.', 'llm.example.com.'],
  ])('RF-1104 %s is looked up as %s', (host, bare) => {
    expect(bareHost(host)).toBe(bare);
  });
});
