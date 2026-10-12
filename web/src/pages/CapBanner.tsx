import type { JSX } from 'preact';
import type { Caps, ListedAccount } from '../api/admin-schemas.js';
import { Glyph } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import { microsToDollars } from '../lib/usd.js';
import { serverMonthOf } from './admin-month.js';

// RF-1106, design-system.md section 14 (cap banner): from 80% of the server's monthly cap every
// administration page opens with a warning. On the users page "Review caps" jumps to the caps form.

export interface CapBannerProps {
  readonly users: readonly ListedAccount[];
  readonly caps: Caps;
  /** True on the page that holds the caps form. */
  readonly onCapsPage?: boolean;
}

// RF-1106
export function CapBanner({ users, caps, onCapsPage = false }: CapBannerProps): JSX.Element | null {
  const month = serverMonthOf(users, BigInt(caps.serverMonthMicros));
  if (!month.warn) return null;
  const used = `$${microsToDollars(month.usedMicros.toString())}`;
  const cap = `$${microsToDollars(caps.serverMonthMicros)}`;
  return (
    <div class="rst-cap-banner" role="status">
      <Glyph name="warning-triangle" />
      <span class="rst-cap-banner__text">
        <strong>{`The server has used ${String(month.percent)}% of its monthly cap (${used} of ${cap}).`}</strong>{' '}
        Runs on server keys stop at the cap; users with their own keys are not affected.
      </span>
      {onCapsPage ? <a href="#caps">Review caps</a> : <Link href="/admin/users">Review caps</Link>}
    </div>
  );
}
