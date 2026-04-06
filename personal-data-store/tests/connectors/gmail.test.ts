import { describe, it, expect, vi, beforeEach } from "vitest";
import { gmailConnector } from "../../src/connectors/gmail.connector.js";
import { resetDb } from "../helpers/setup.js";
import { db } from "../../src/db/index.js";
import { documents } from "../../src/domains/documents/documents.schema.js";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Gmail Connector", () => {
  beforeEach(async () => {
    await resetDb();
    mockFetch.mockReset();
    process.env.GMAIL_CLIENT_ID = "mock-client-id";
    process.env.GMAIL_CLIENT_SECRET = "mock-client-secret";
    process.env.GMAIL_REFRESH_TOKEN = "mock-refresh-token";
  });

  it("fetches emails and stores as documents", async () => {
    // Mock token refresh
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "mock-access-token" }),
    });
    // Mock messages.list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "msg1" }] }),
    });
    // Mock messages.get for msg1
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "msg1",
        snippet: "Hello, this is a test email",
        payload: {
          headers: [
            { name: "From", value: "alice@example.com" },
            { name: "To", value: "me@example.com" },
            { name: "Subject", value: "Test Email" },
            { name: "Date", value: "Mon, 6 Apr 2026 10:00:00 +0000" },
          ],
        },
      }),
    });

    const result = await gmailConnector.sync();
    expect(result.recordsSynced).toBe(1);

    const docs = await db.select().from(documents);
    expect(docs).toHaveLength(1);
    expect(docs[0].domain).toBe("email");
    expect(docs[0].title).toBe("Test Email");
  });

  it("handles missing credentials", async () => {
    delete process.env.GMAIL_CLIENT_ID;
    await expect(gmailConnector.sync()).rejects.toThrow("Gmail OAuth credentials not configured");
  });
});
