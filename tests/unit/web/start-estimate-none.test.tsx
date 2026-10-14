import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { EstimateSection } from '../../../web/src/pages/EstimateSection.js';

// RF-1001, DEC-117: with no code map yet the estimate is `none`, and the page still draws the run
// cap and the confirm threshold, so a refusal that names either of them is shown next to its field
// and read out with it (aria-describedby), not kept where no field is.

const thresholdRefusal =
  'The threshold must not be above the run cap. Lower it, or raise the run cap.';

function renderNone(thresholdError: { readonly message: string } | undefined): void {
  render(
    <EstimateSection
      scanOnly={false}
      estimate={{ status: 'none' }}
      warnings={[]}
      onRetry={() => undefined}
      cap={{
        text: '0.10',
        capMicros: 100_000n,
        error: undefined,
        onInput: () => undefined,
        threshold: { text: '0.25', error: thresholdError, onInput: () => undefined },
      }}
    />,
  );
}

function valueOf(label: string): string {
  const element = screen.getByLabelText(label);
  return element instanceof HTMLInputElement ? element.value : '';
}

describe('estimate not yet available', () => {
  it('RF-1001 shows the run cap and the confirm threshold with no code map', () => {
    renderNone(undefined);

    expect(valueOf('Run cap (USD)')).toBe('0.10');
    expect(valueOf('Ask before a run estimated above (USD)')).toBe('0.25');
  });

  it('RF-1001 shows a threshold refusal next to its field, which reads it, with no code map', () => {
    renderNone({ message: thresholdRefusal });

    const field = screen.getByLabelText('Ask before a run estimated above (USD)');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toContain('confirm-above-error');
    expect(document.getElementById('confirm-above-error')?.textContent).toContain(thresholdRefusal);
  });
});
