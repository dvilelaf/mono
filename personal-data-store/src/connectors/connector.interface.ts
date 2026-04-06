export interface SyncResult {
  recordsSynced: number;
  errors?: string[];
}

export interface Connector {
  name: string;
  schedule: string | null;
  sync(): Promise<SyncResult>;
}
