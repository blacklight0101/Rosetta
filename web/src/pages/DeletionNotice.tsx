import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

// RF-1012: what a deletion freed, announced politely. The row that had the focus is gone, so the
// notice takes it.

// RF-1012
export function DeletionNotice({ text }: { readonly text: string }): JSX.Element {
  const ref = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (text !== '') ref.current?.focus();
  }, [text]);
  return (
    <p ref={ref} role="status" tabIndex={-1} class="rst-p140-notice">
      {text}
    </p>
  );
}
