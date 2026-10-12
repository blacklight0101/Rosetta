import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo } from 'preact/hooks';
import type { ApiClient } from '../api/client.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { SignOutButton } from '../components/SignOutButton.js';
import type { ThemePreference } from '../lib/theme.js';
import { AppContext } from './app-context.js';
import { NotFoundPage } from './NotFoundPage.js';
import { buildNavigation } from './navigation.js';
import { matchRoute, type RouteMatch } from './route-match.js';
import { RouteParamsContext } from './route-params.js';
import { SignedInShell } from './SignedInShell.js';
import type { RouteDefinition } from './route-types.js';
import { useLocation } from './router.js';
import { SessionContext } from './session-context.js';
import { useSession } from './use-session.js';
import { useTheme } from './use-theme.js';

// P1-12: the application. A public page renders on its own; any other page first asks the server
// who is signed in (RF-1009), then draws the shell around the page. The server stays the judge
// of access: a role that may not open a page gets the same not-found page as a path that does not
// exist (RF-1105).

export interface AppProps {
  readonly client: ApiClient;
  readonly routes: readonly RouteDefinition[];
  /** Leaves for another page with a full page load (the sign-in page is served by the server). */
  readonly assign: (path: string) => void;
}

interface SignedInProps extends AppProps {
  readonly match: RouteMatch;
  readonly location: string;
  readonly theme: ThemePreference;
  readonly onTheme: (next: ThemePreference) => void;
}

const signInPath = '/sign-in';

/** The page of the route, with the route's parameters for it to read (a denied one is not found). */
function RoutedPage(props: { readonly match: RouteMatch; readonly denied: boolean }): JSX.Element {
  const { match, denied } = props;
  const Component = denied ? NotFoundPage : match.route.component;
  return (
    <RouteParamsContext.Provider value={match.params}>
      <Component />
    </RouteParamsContext.Provider>
  );
}

function SignedInPage(props: SignedInProps): JSX.Element {
  const { client, routes, assign, match, location, theme, onTheme } = props;
  const goToSignIn = useCallback(() => {
    assign(signInPath);
  }, [assign]);
  const state = useSession(client, goToSignIn);
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading
      </p>
    );
  }
  if (state.status === 'failed') {
    return (
      <main class="rst-page" id="main-content" tabIndex={-1}>
        <ErrorBanner error={state.error} />
      </main>
    );
  }
  const { user } = state.session;
  const denied = match.route.access === 'admin' && user.role !== 'admin';
  const page = <RoutedPage match={match} denied={denied} />;
  if (match.route.chrome === 'bare' && !denied) {
    return <SessionContext.Provider value={user}>{page}</SessionContext.Provider>;
  }
  const navigation = buildNavigation({
    routes,
    role: user.role,
    params: match.params,
    path: location,
  });
  return (
    <SessionContext.Provider value={user}>
      <SignedInShell
        user={user}
        path={location}
        projectId={match.params['projectId']}
        navigation={navigation}
        theme={theme}
        onTheme={onTheme}
        actions={<SignOutButton />}
      >
        {page}
      </SignedInShell>
    </SessionContext.Provider>
  );
}

// RF-1009, RNF-010
export function App(props: AppProps): JSX.Element {
  const services = useMemo(
    () => ({ client: props.client, assign: props.assign }),
    [props.client, props.assign],
  );
  return (
    <AppContext.Provider value={services}>
      <Routed {...props} />
    </AppContext.Provider>
  );
}

function Routed(props: AppProps): JSX.Element {
  const location = useLocation();
  const [theme, onTheme] = useTheme();
  const match = matchRoute(location, props.routes);
  const title = match?.route.title ?? 'Page not found';
  useEffect(() => {
    document.title = title === 'Rosetta' ? title : `${title} - Rosetta`;
  }, [title]);
  if (match === undefined) {
    return (
      <main class="rst-main" id="main-content" tabIndex={-1}>
        <NotFoundPage />
      </main>
    );
  }
  if (match.route.access === 'public') {
    const Page = match.route.component;
    return <Page />;
  }
  return (
    <SignedInPage {...props} match={match} location={location} theme={theme} onTheme={onTheme} />
  );
}
