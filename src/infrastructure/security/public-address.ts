import { BlockList, isIP } from 'node:net';

// RF-1104, DEC-112, threat model TB5 (SSRF): which IP addresses a user's key may be sent to. Every
// special-purpose range of the IANA IPv4 and IPv6 registries is refused (private, loopback,
// link-local, shared CGNAT, documentation, benchmarking, multicast, reserved, unique-local,
// site-local, NAT64, 6to4, Teredo), plus the cloud metadata addresses that sit in public space.
// IPv4-mapped and IPv4-compatible IPv6 addresses are refused whatever they map to. The IPv4 and
// IPv6 lists are kept apart because a BlockList matches IPv4 addresses against IPv6 rules for the
// mapped range.

const IPV4_BLOCKED: readonly (readonly [string, number])[] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  // Azure's platform endpoint answers metadata requests from a public address.
  ['168.63.129.16', 32],
];

const IPV6_BLOCKED: readonly (readonly [string, number])[] = [
  // Unspecified, loopback and the deprecated IPv4-compatible form.
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

function blockList(ranges: readonly (readonly [string, number])[], type: 'ipv4' | 'ipv6') {
  const list = new BlockList();
  for (const [network, prefix] of ranges) list.addSubnet(network, prefix, type);
  return list;
}

const ipv4Blocked = blockList(IPV4_BLOCKED, 'ipv4');
const ipv6Blocked = blockList(IPV6_BLOCKED, 'ipv6');
const ipv4Mapped = blockList([['::ffff:0:0', 96]], 'ipv6');

/** The host as a lookup or an address check takes it: lower case, an IPv6 literal unbracketed. */
// RF-1104
export function bareHost(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
}

/** True only for an IP address outside every refused range; false for anything else. */
// RF-1104
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !ipv4Blocked.check(address, 'ipv4');
  if (family !== 6) return false;
  return !ipv4Mapped.check(address, 'ipv6') && !ipv6Blocked.check(address, 'ipv6');
}
