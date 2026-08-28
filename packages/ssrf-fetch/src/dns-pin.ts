import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { isPublicUnicastAddress } from './ip-blocklist';

export interface PinnedAddress {
  address: string;
  family: number;
}

export type DnsValidationFailure = { blocked: true; reason: string };

/**
 * Resolves every A/AAAA record for `hostname` and blocks the whole lookup if ANY
 * resolved address is non-public — a conservative stance against multi-record DNS
 * tricks. Returns the first valid address to pin the subsequent TCP connection to,
 * which is what actually closes the DNS-rebinding TOCTOU gap: a second lookup at
 * connect time could return a different (private) address than the one validated
 * here, so the caller must connect to exactly this address, not re-resolve.
 */
export async function resolveAndValidateHostname(
  hostname: string,
): Promise<PinnedAddress | DnsValidationFailure> {
  let records: LookupAddress[];
  try {
    records = await dnsLookup(hostname, { all: true });
  } catch {
    return { blocked: true, reason: `DNS resolution failed for "${hostname}"` };
  }

  if (!Array.isArray(records) || records.length === 0) {
    return { blocked: true, reason: `DNS resolution returned no addresses for "${hostname}"` };
  }

  for (const record of records) {
    if (!isPublicUnicastAddress(record.address)) {
      return {
        blocked: true,
        reason: `Resolved address ${record.address} for "${hostname}" is not a public address`,
      };
    }
  }

  return { address: records[0].address, family: records[0].family };
}

export function isDnsValidationFailure(
  value: PinnedAddress | DnsValidationFailure,
): value is DnsValidationFailure {
  return 'blocked' in value;
}
