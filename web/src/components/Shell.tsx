import type { ComponentChildren, JSX } from 'preact';
import type { NavGroup } from '../app/navigation.js';
import { Header, type HeaderProps } from './Header.js';
import { Navigation } from './Navigation.js';

// design-system.md section 3: the signed-in shell is the header, the side navigation, an optional
// banner region and the main region. A skip link comes first so a keyboard user can pass the
// navigation.

const mainRegionId = 'main-content';

export interface ShellProps extends HeaderProps {
  readonly navigation: readonly NavGroup[];
  /** Cloud warning, budget warnings and connection-lost notices, above the page. */
  readonly banners?: ComponentChildren;
  readonly children: ComponentChildren;
}

// RNF-010
export function Shell(props: ShellProps): JSX.Element {
  const { navigation, banners, children, ...header } = props;
  return (
    <div class="rst-shell">
      <a class="rst-skip-link" href={`#${mainRegionId}`}>
        Skip to content
      </a>
      <Header {...header} />
      <div class="rst-shell__body">
        <Navigation groups={navigation} />
        <div class="rst-shell__content">
          {banners === undefined ? null : (
            <div class="rst-shell__banners" data-testid="shell-banners">
              {banners}
            </div>
          )}
          <main class="rst-main" id={mainRegionId} tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
