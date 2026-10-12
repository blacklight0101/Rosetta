import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';

// RNF-010, design-system.md section 8: after a refused submit, focus goes to the first invalid
// field of the form, or to the error banner when no field is named, so a keyboard or screen reader
// user lands on what needs fixing and the error is read out. `refusal` changes on every refusal.

const target = '[aria-invalid="true"], [data-testid="error-banner"]';

// RNF-010
export function useRefusalFocus(form: RefObject<HTMLElement>, refusal: unknown): void {
  useEffect(() => {
    if (refusal === undefined || refusal === 0) return;
    form.current?.querySelector<HTMLElement>(target)?.focus();
  }, [form, refusal]);
}
