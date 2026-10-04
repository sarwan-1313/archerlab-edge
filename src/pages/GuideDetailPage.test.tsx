// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guideManualSteps } from '../data/userGuide';
import { routeForPage } from '../navigation/routes';
import { GuideDetailPage } from './GuideDetailPage';

afterEach(cleanup);

function renderStep(index: number) {
  const onNavigate = vi.fn();
  const onProductNavigate = vi.fn();
  render(<GuideDetailPage step={guideManualSteps[index]} onNavigate={onNavigate} onProductNavigate={onProductNavigate} />);
  return { onNavigate, onProductNavigate };
}

describe('GuideDetailPage', () => {
  it('renders the shared manual sections and progress for a guide entry', () => {
    renderStep(1);

    expect(screen.getByRole('heading', { name: 'Set Up Camera', level: 1 })).toBeTruthy();
    expect(screen.getByText('Step 2 of 10')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Step-by-step' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Expected result' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tips' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Troubleshooting' })).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
  });

  it('connects previous, back, and next links to canonical URLs and app navigation', () => {
    const { onNavigate } = renderStep(1);
    const previous = screen.getByRole('link', { name: 'Previous step: Start Analysis' });
    const back = screen.getByRole('link', { name: 'Back to Guide' });
    const next = screen.getByRole('link', { name: 'Next step: Confirm Readiness' });

    expect(previous.getAttribute('href')).toBe(routeForPage('guide-start-analysis'));
    expect(back.getAttribute('href')).toBe(routeForPage('user-guide'));
    expect(next.getAttribute('href')).toBe(routeForPage('guide-readiness'));

    fireEvent.click(previous);
    fireEvent.click(back);
    fireEvent.click(next);
    expect(onNavigate.mock.calls.map(([page]) => page)).toEqual([
      'guide-start-analysis',
      'user-guide',
      'guide-readiness',
    ]);
  });

  it('omits Previous on step one and Next on step ten', () => {
    const first = render(<GuideDetailPage step={guideManualSteps[0]} onNavigate={vi.fn()} onProductNavigate={vi.fn()} />);
    expect(screen.queryByText('Previous')).toBeNull();
    first.unmount();

    render(<GuideDetailPage step={guideManualSteps[9]} onNavigate={vi.fn()} onProductNavigate={vi.fn()} />);
    expect(screen.queryByText('Next')).toBeNull();
  });

  it('uses the compact contents control and secondary product action', () => {
    const { onNavigate, onProductNavigate } = renderStep(9);

    fireEvent.change(screen.getByRole('combobox', { name: 'Guide contents' }), { target: { value: 'guide-review-shots' } });
    fireEvent.click(screen.getByRole('button', { name: /Open Analytics/ }));

    expect(onNavigate).toHaveBeenCalledWith('guide-review-shots');
    expect(onProductNavigate).toHaveBeenCalledWith('dashboard');
  });
});
