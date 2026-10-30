// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { COACH_TOOLS_KEY, readCoachTools, useCoachTools, writeCoachTools } from './coachTools';

beforeEach(() => localStorage.clear());

describe('coach tools setting', () => {
  it('is off by default and remembered on this device', () => {
    expect(readCoachTools()).toBe(false);
    writeCoachTools(true);
    expect(localStorage.getItem(COACH_TOOLS_KEY)).toBe('1');
    expect(readCoachTools()).toBe(true);
    writeCoachTools(false);
    expect(localStorage.getItem(COACH_TOOLS_KEY)).toBeNull();
  });

  it('updates every component that uses it', () => {
    const { result } = renderHook(() => useCoachTools());
    expect(result.current).toBe(false);
    act(() => writeCoachTools(true));
    expect(result.current).toBe(true);
  });
});
