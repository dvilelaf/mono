import { SectionCard } from '../../components/SectionCard.js';

/**
 * Tier 3 launcher card: 5 most-recent posted Tasks with state pill + claims
 * counter. View-all button (only when >5) calls `onLoadMore`, which Task 16
 * wires to `api.fetchLauncherTasks` pagination.
 *
 * `PostedTask` mirrors `LauncherTasksResponse.tasks[*]` from the Task 9 SPA
 * types contract. When that types module lands, switch to importing from
 * there and drop this local copy.
 */

export interface PostedTask {
  taskId: string;
  taskCid: string;
  solverNet: string;
  postedAt: string;
  state: 'open' | 'claims-in-flight' | 'fully-claimed' | 'settled' | 'failed';
  claims: { current: number; max: number };
  budget: { totalWei: string; remainingWei: string; reclaimableAt?: string };
  summary?: { title?: string; resolutionTime?: string };
}

const STATE_COLORS: Record<PostedTask['state'], string> = {
  'open': 'var(--accent-sky)',
  'claims-in-flight': 'var(--vow-green)',
  'fully-claimed': 'var(--fg-muted)',
  'settled': 'var(--fg-dim)',
  'failed': 'var(--break-red)',
};

export interface PostedTasksListProps {
  tasks: PostedTask[];
  onLoadMore: () => void;
}

export function PostedTasksList({ tasks, onLoadMore }: PostedTasksListProps): JSX.Element {
  const visible = tasks.slice(0, 5);
  const hasMore = tasks.length > 5;

  return (
    <SectionCard
      title="Recent posted Tasks"
      summary={`${tasks.length} shown`}
      defaultExpanded
    >
      {visible.length === 0 ? (
        <p style={{ color: 'var(--fg-dim)' }}>No tasks posted yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {visible.map((t) => (
            <li
              key={t.taskId}
              data-testid="posted-task-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '12px',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '13px',
              }}
            >
              <span style={{ color: 'var(--fg)' }}>
                {t.summary?.title ?? t.taskId.slice(0, 10)}
              </span>
              <span style={{ color: STATE_COLORS[t.state] }}>{t.state}</span>
              <span style={{ color: 'var(--fg-muted)' }}>
                {t.claims.current}/{t.claims.max}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          style={{
            marginTop: '12px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '8px 16px',
            color: 'var(--fg)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          View all
        </button>
      )}
    </SectionCard>
  );
}
