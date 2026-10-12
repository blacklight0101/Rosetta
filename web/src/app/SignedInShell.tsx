import type { JSX } from 'preact';
import { Shell, type ShellProps } from '../components/Shell.js';

// RF-1010, RF-1106, design-system.md section 14: the shell of every signed-in page with the totals
// pill in the header, read from the ledger and read again whenever a page announces a model call,
// and for the administrator the cap banner from 80% of the server's monthly cap on every page but
// the administration pages, which show their own.

export interface SignedInShellProps extends Omit<ShellProps, 'totals' | 'banners'> {
  /** The current location; the administration pages draw their own cap banner. */
  readonly path: string;
  /** The open project, whose cost page the pill links to. */
  readonly projectId?: string | undefined;
}

// RF-1010
export function SignedInShell(props: SignedInShellProps): JSX.Element {
  const { path: _path, projectId: _projectId, ...shell } = props;
  return <Shell {...shell} />;
}
