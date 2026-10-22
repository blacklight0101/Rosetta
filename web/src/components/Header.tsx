import type { ComponentChildren, JSX } from 'preact';
import type { ThemePreference } from '../lib/theme.js';
import { StatusBadge } from './StatusBadge.js';
import { ThemeToggle } from './ThemeToggle.js';
import { Wordmark } from './Wordmark.js';

// design-system.md section 3: the signed-in header carries the wordmark, the project's repository
// when a project is open, the totals pill (RF-1010, a slot filled by its own card), the user with
// the role and the theme toggle.

interface HeaderUser {
  readonly displayName: string;
  readonly role: 'admin' | 'user';
}

export interface HeaderProps {
  readonly user: HeaderUser;
  readonly repository?: string;
  /** The "This run" meter, beside the totals while a run is active (RF-1003). */
  readonly runMeter?: ComponentChildren;
  /** The totals pill: always on screen once a card fills it. */
  readonly totals?: ComponentChildren;
  /** Extra header controls, for example the sign-out menu. */
  readonly actions?: ComponentChildren;
  readonly theme: ThemePreference;
  readonly onTheme: (next: ThemePreference) => void;
}

// RF-1010, RNF-010
export function Header(props: HeaderProps): JSX.Element {
  return (
    <header class="rst-header" role="banner">
      <Wordmark />
      {props.repository === undefined ? null : (
        <span class="rst-mono rst-header__repository" data-testid="header-repository">
          {props.repository}
        </span>
      )}
      <span class="rst-header__spacer" />
      {props.runMeter}
      {props.totals === undefined ? null : (
        <div class="rst-header__totals" data-testid="header-totals">
          {props.totals}
        </div>
      )}
      <div class="rst-header__user" data-testid="header-user">
        <span>{props.user.displayName}</span>
        <StatusBadge list="Role" value={props.user.role} />
        {props.actions}
      </div>
      <ThemeToggle theme={props.theme} onTheme={props.onTheme} />
    </header>
  );
}
