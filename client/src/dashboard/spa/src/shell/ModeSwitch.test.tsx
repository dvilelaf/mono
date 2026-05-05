import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSwitch } from './ModeSwitch.js';

describe('ModeSwitch', () => {
  it('renders both modes; current is highlighted', () => {
    render(<ModeSwitch mode="operator" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Operator' }).getAttribute('data-active')).toBe('true');
    expect(screen.getByRole('button', { name: 'Launcher' }).getAttribute('data-active')).toBe('false');
  });

  it('fires onChange on click of inactive mode', () => {
    const onChange = vi.fn();
    render(<ModeSwitch mode="operator" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Launcher' }));
    expect(onChange).toHaveBeenCalledWith('launcher');
  });

  it('does not fire onChange when clicking the already-active mode', () => {
    const onChange = vi.fn();
    render(<ModeSwitch mode="operator" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Operator' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes a labelled group for screen readers', () => {
    render(<ModeSwitch mode="operator" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'App mode' })).toBeTruthy();
  });
});
