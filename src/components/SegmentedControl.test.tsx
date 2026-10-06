// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

describe('SegmentedControl', () => {
  it('reflects the selected value and updates it through onChange', () => {
    const { rerender } = render(
      <SegmentedControl
        name="camera"
        selectedValue="front"
        onChange={() => undefined}
        options={[
          { label: 'Side', value: 'side' },
          { label: 'Front', value: 'front' },
        ]}
      />,
    );

    expect((screen.getByRole('radio', { name: 'Side' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('radio', { name: 'Front' }) as HTMLInputElement).checked).toBe(true);

    rerender(
      <SegmentedControl
        name="camera"
        selectedValue="side"
        options={[
          { label: 'Side', value: 'side' },
          { label: 'Front', value: 'front' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Side' }));
    expect((screen.getByRole('radio', { name: 'Side' }) as HTMLInputElement).checked).toBe(true);
  });
});
