export interface SyncResult {
  recordsSynced: number;
  errors?: string[];
}

export interface SyncOptions {
  startDate?: string;
  endDate?: string;
}

export interface Connector {
  name: string;
  schedule: string | null;
  sync(options?: SyncOptions): Promise<SyncResult>;
}
