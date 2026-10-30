// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnchorFaceSummary, ShotReport } from '../../video-analysis/types';
import { AnchorFaceDiagram } from './AnchorFaceDiagram';

afterEach(cleanup);

const face = (x: number, y: number, confidence: number): AnchorFaceSummary => ({ x, y, toChin: Math.hypot(x, y), toMouthCorner: 0.2, toNose: 0.4, wobble: 0.01, frames: 8, confidence });
const shot = (index: number, anchorFace?: AnchorFaceSummary) => ({ index, anchorFace } as unknown as ShotReport);

describe('AnchorFaceDiagram', () => {
  it('draws one numbered dot per shot with a face measurement, hollow when the face was not seen well', () => {
    const { container } = render(<AnchorFaceDiagram shots={[shot(1, face(0.1, 0.02, 0.9)), shot(2), shot(3, face(0.2, 0.1, 0.2))]} />);
    expect(screen.getByRole('img', { name: 'Face diagram with 2 anchor points' })).toBeTruthy();
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    expect(container.querySelectorAll('.va-anchor-face__dot--rough')).toHaveLength(1);
    expect(screen.getByText('1 of 2 shots with the face seen well.', { exact: false })).toBeTruthy();
    expect(screen.getByText('Experimental')).toBeTruthy();
  });

  it('is left out when no shot has a face measurement', () => {
    const { container } = render(<AnchorFaceDiagram shots={[shot(1), shot(2)]} />);
    expect(container.innerHTML).toBe('');
  });
});
