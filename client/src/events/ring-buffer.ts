import type { StructuredEvent, StructuredEventKind } from './types.js';

export interface EventFilter {
  kinds?: StructuredEventKind[];
  sinceId?: string;
  limit?: number;
}

export type EventSubscriber = (event: StructuredEvent) => void;

export class EventRingBuffer {
  private buffer: StructuredEvent[] = [];
  private subscribers = new Set<EventSubscriber>();

  constructor(private capacity: number = 1000) {}

  push(event: StructuredEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.capacity) {
      this.buffer = this.buffer.slice(-this.capacity);
    }
    for (const sub of this.subscribers) {
      try { sub(event); } catch { /* never let subscriber errors propagate */ }
    }
  }

  snapshot(filter: EventFilter = {}): StructuredEvent[] {
    let out = this.buffer;
    if (filter.sinceId) {
      const idx = out.findIndex((e) => e.id === filter.sinceId);
      out = idx >= 0 ? out.slice(idx + 1) : out;
    }
    if (filter.kinds && filter.kinds.length > 0) {
      const allowed = new Set(filter.kinds);
      out = out.filter((e) => allowed.has(e.kind));
    }
    if (filter.limit !== undefined) out = out.slice(-filter.limit);
    return [...out];
  }

  subscribe(sub: EventSubscriber): () => void {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }
}
