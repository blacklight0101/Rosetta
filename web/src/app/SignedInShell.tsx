import type { JSX } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import type { AccountTotals } from '../api/cost-schemas.js';
import { Shell, type ShellProps } from '../components/Shell.js';
import { TopbarRunMeter } from '../components/TopbarRunMeter.js';
import { TotalsPill } from '../components/TotalsPill.js';
import { topBarMeterOf } from '../lib/live-run/top-bar-meter.js';
import { CapBanner } from '../pages/CapBanner.js';
import { serverMonthOf } from '../pages/admin-month.js';
import { RunMeterContext, type RunMeterReading } from './run-meter-signal.js';
import { useAccountTotals } from './use-account-totals.js';
import { UsageSignalContext } from './usage-signal.js';

// RF-1010, RF-1106, design-system.md section 14: the shell of every signed-in page with the totals
// pill in the header, read from the ledger and read again whenever a page announces a model call,
// and for the administrator the cap banner from 80% of the server's monthly cap in the banner slot
// of every page, the administration pages included (P1-107); on the users and caps page its link
// jumps to the caps form.

export interface SignedInShellProps extends Omit<ShellProps, 'totals' | 'banners' | 'runMeter'> {
  /** The current location; on the users and caps page the banner links to the caps form. */
  readonly path: string;
  /** The open project, whose cost page the pill links to. */
  readonly projectId?: string | undefined;
}

function bannerOf(totals: AccountTotals | undefined, path: string): JSX.Element | undefined {
  const server = totals?.server ?? null;
  if (server === null) return undefined;
  const { serverMonthToDate, caps } = server;
  if (!serverMonthOf(serverMonthToDate, BigInt(caps.serverMonthMicros)).warn) return undefined;
  return <CapBanner spent={serverMonthToDate} caps={caps} onCapsPage={path === '/admin/users'} />;
}

// RF-1010
export function SignedInShell(props: SignedInShellProps): JSX.Element {
  const { path, projectId, ...shell } = props;
  const [version, setVersion] = useState(0);
  const announce = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);
  const [reading, setReading] = useState<RunMeterReading | undefined>();
  const totals = useAccountTotals(version);
  const href =
    projectId === undefined ? undefined : `/projects/${encodeURIComponent(projectId)}/cost`;
  return (
    <UsageSignalContext.Provider value={announce}>
      <RunMeterContext.Provider value={setReading}>
        <Shell
          {...shell}
          runMeter={
            reading === undefined ? undefined : (
              <TopbarRunMeter meter={topBarMeterOf(reading.spent, reading.cap, reading.unit)} />
            )
          }
          totals={totals === undefined ? undefined : <TotalsPill totals={totals} href={href} />}
          banners={bannerOf(totals, path)}
        />
      </RunMeterContext.Provider>
    </UsageSignalContext.Provider>
  );
}
