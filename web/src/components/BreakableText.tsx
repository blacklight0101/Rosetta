import type { JSX } from 'preact';

// RNF-010: text whose paths wrap at "/" and before ":" (stub, replaced by the fix).
export function BreakableText({ text }: { readonly text: string }): JSX.Element {
  return <>{text}</>;
}
