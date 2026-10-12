import { useEffect, useState } from 'preact/hooks';

// P1-12: the browser's History API as a tiny client router. `navigate` pushes an entry and tells
// the listeners; the back and forward buttons arrive as `popstate`.

const changeEvent = 'rosetta:navigate';

const here = (): string => `${window.location.pathname}${window.location.search}`;

/** Goes to a path of this application without reloading the page. */
export function navigate(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event(changeEvent));
}

/** The current path and query string; the component renders again when it changes. */
export function useLocation(): string {
  const [location, setLocation] = useState(here);
  useEffect(() => {
    const update = (): void => {
      setLocation(here());
    };
    update();
    window.addEventListener('popstate', update);
    window.addEventListener(changeEvent, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(changeEvent, update);
    };
  }, []);
  return location;
}
