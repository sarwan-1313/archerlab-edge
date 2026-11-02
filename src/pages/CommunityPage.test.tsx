// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommunityPage } from './CommunityPage';

afterEach(cleanup);

describe('Community page', () => {
  it('says it needs the optional account when this site has no cloud project', () => {
    render(<CommunityPage />);
    expect(screen.getByRole('heading', { name: 'Community' })).toBeTruthy();
    expect(screen.getByText(/needs the optional account, which is not set up on this site/i)).toBeTruthy();
  });
});
