import type { JSX } from 'preact';

// RF-1015, P8-11: the checks of a package are cut at the server's limit; the page says so and where the
// whole file is.

export function ChecksCut(props: { readonly cut: boolean }): JSX.Element | null {
  if (!props.cut) return null;
  return (
    <p class="rst-settings__note" data-testid="checks-cut">
      These checks were cut because they are long. The whole of checks.md is in the package
      download.
    </p>
  );
}
