import { BlockList, isIP } from 'node:net';

/** Matches an IPv4/IPv6 address against exact addresses and CIDR ranges. */
export function ipAllowed(rawIp: string, allowlist: string[]): boolean {
  const ip = rawIp.replace(/^::ffff:/, '');
  const family = isIP(ip);
  if (!family) return false;

  const list = new BlockList();
  for (const entry of allowlist) {
    const [addr, prefix] = entry.split('/');
    const entryFamily = isIP(addr);
    if (!entryFamily) continue;
    const type = entryFamily === 6 ? 'ipv6' : 'ipv4';
    if (prefix === undefined) list.addAddress(addr, type);
    else list.addSubnet(addr, Number(prefix), type);
  }
  return list.check(ip, family === 6 ? 'ipv6' : 'ipv4');
}
