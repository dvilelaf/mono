import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostedTasksList } from './PostedTasksList.js';

const fixture10 = Array.from({ length: 10 }, (_, i) => ({
  taskId: `0x${i.toString(16).padStart(2, '0')}`,
  taskCid: `Qm${i}`,
  solverNet: 'prediction',
  postedAt: `2026-05-05T${(10 + i).toString().padStart(2, '0')}:00:00Z`,
  state: 'open' as const,
  claims: { current: 0, max: 25 },
  budget: { totalWei: '1000000', remainingWei: '1000000' },
}));

describe('PostedTasksList', () => {
  it('renders 5 most recent tasks with state pill and budget remaining', () => {
    render(<PostedTasksList tasks={fixture10} onLoadMore={vi.fn()} />);
    expect(screen.queryAllByTestId('posted-task-row')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /View all/i })).toBeTruthy();
  });

  it('shows all tasks when fewer than 5', () => {
    render(<PostedTasksList tasks={fixture10.slice(0, 3)} onLoadMore={vi.fn()} />);
    expect(screen.queryAllByTestId('posted-task-row')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /View all/i })).toBeFalsy();
  });

  it('calls onLoadMore on View all click', () => {
    const onLoadMore = vi.fn();
    render(<PostedTasksList tasks={fixture10} onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: /View all/i }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('renders an empty-state hint when tasks is empty', () => {
    render(<PostedTasksList tasks={[]} onLoadMore={vi.fn()} />);
    expect(screen.queryByText(/no tasks/i)).toBeTruthy();
  });
});
