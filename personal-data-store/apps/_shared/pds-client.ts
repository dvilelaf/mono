import type { YieldPosition, IncomeSummary, PdsDocument, NewPdsDocument } from "./types.js";

export class PdsClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`PDS API error: ${res.status} ${res.statusText} on ${path}`);
    return res.json();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PDS API error: ${res.status} ${res.statusText} on POST ${path}`);
    return res.json();
  }

  async getYieldPositions(): Promise<YieldPosition[]> {
    return this.get("/api/finance/yield-positions");
  }

  async getIncomeSummary(from?: string): Promise<IncomeSummary> {
    const params = from ? `?from=${from}` : "";
    return this.get(`/api/finance/income/summary${params}`);
  }

  async getDocuments(domain?: string, type?: string): Promise<PdsDocument[]> {
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    if (type) params.set("type", type);
    const qs = params.toString();
    return this.get(`/api/documents${qs ? `?${qs}` : ""}`);
  }

  async postDocument(doc: NewPdsDocument): Promise<PdsDocument> {
    return this.post("/api/documents", doc);
  }
}
