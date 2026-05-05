import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EmissionsPlaceholder } from './EmissionsPlaceholder.js';

describe('EmissionsPlaceholder', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a Phase B+ ve-JINN gauge placeholder', () => {
    render(<EmissionsPlaceholder />);
    // Body is collapsed by default; expand it so future-facing copy is visible.
    fireEvent.click(screen.getByText(/Direct JINN emissions/i));
    expect(screen.queryAllByText(/ve-JINN/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Phase B/i).length).toBeGreaterThan(0);
  });

  it('flags v1 scope as future-facing', () => {
    render(<EmissionsPlaceholder />);
    fireEvent.click(screen.getByText(/Direct JINN emissions/i));
    expect(screen.queryByText(/Out of scope for v1/i)).toBeTruthy();
  });
});
