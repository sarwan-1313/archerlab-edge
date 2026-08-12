import { describe, expect, it } from 'vitest';
import { getBowSide, getDrawSide } from './handedness';

describe('archer handedness mapping', () => {
  it('uses the opposite arm as the bow arm', () => {
    expect(getBowSide('right')).toBe('left');
    expect(getDrawSide('right')).toBe('right');
    expect(getBowSide('left')).toBe('right');
    expect(getDrawSide('left')).toBe('left');
  });
});
