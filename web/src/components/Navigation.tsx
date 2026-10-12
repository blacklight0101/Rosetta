import type { JSX } from 'preact';
import type { NavGroup } from '../app/navigation.js';
import { Link } from './Link.js';

// design-system.md section 3: the side navigation, in groups. The current page carries
// aria-current; a group has a heading unless it is the main one.

export interface NavigationProps {
  readonly groups: readonly NavGroup[];
}

// RNF-010
export function Navigation({ groups }: NavigationProps): JSX.Element {
  return (
    <nav class="rst-nav" aria-label="Main" data-testid="navigation">
      {groups.map((group) => (
        <div key={group.id} class="rst-nav__group" data-testid={`nav-group-${group.id}`}>
          {group.label === undefined ? null : <p class="rst-nav__heading">{group.label}</p>}
          {group.items.map((item) => (
            <Link key={item.path} href={item.path} class="rst-nav__link" current={item.current}>
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
