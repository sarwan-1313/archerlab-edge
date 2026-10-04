// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guideManualSteps } from '../data/userGuide';
import { routeForPage } from '../navigation/routes';
import { UserGuidePage } from './UserGuidePage';

afterEach(cleanup);

describe('UserGuidePage', () => {
  it('renders every guide step as a real link with its canonical URL', () => {
    render(<UserGuidePage onStart={vi.fn()} onHome={vi.fn()} onOnboarding={vi.fn()} onOpenStep={vi.fn()} />);

    for (const step of guideManualSteps) {
      const link = screen.getByRole('link', { name: new RegExp(step.title, 'i') });
      expect(link.getAttribute('href')).toBe(routeForPage(step.page));
    }
  });

  it('opens all ten guide steps through the app navigation callback', () => {
    const onOpenStep = vi.fn();
    render(<UserGuidePage onStart={vi.fn()} onHome={vi.fn()} onOnboarding={vi.fn()} onOpenStep={onOpenStep} />);

    for (const step of guideManualSteps) {
      fireEvent.click(screen.getByRole('link', { name: new RegExp(step.title, 'i') }));
    }

    expect(onOpenStep.mock.calls.map(([page]) => page)).toEqual(guideManualSteps.map((step) => step.page));
  });
});
