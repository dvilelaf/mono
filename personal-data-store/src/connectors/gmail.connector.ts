import type { Connector, SyncResult } from "./connector.interface.js";
import { db } from "../db/index.js";
import { documents } from "../domains/documents/documents.schema.js";
import { sql } from "drizzle-orm";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail OAuth credentials not configured");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

export const gmailConnector: Connector = {
  name: "gmail",
  schedule: "0 * * * *",

  async sync(): Promise<SyncResult> {
    const accessToken = await getAccessToken();
    let recordsSynced = 0;

    const after = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=after:${after}&maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status}`);
    const listData = (await listRes.json()) as { messages?: { id: string }[] };
    if (!listData.messages) return { recordsSynced: 0 };

    for (const msg of listData.messages) {
      // Skip if already imported
      const existing = await db
        .select({ id: documents.id })
        .from(documents)
        .where(sql`${documents.metadata}->>'gmailId' = ${msg.id}`)
        .limit(1);
      if (existing.length > 0) continue;

      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) continue;

      const msgData = (await msgRes.json()) as {
        id: string;
        snippet: string;
        payload: { headers: { name: string; value: string }[] };
      };
      const headers = msgData.payload.headers;

      await db.insert(documents).values({
        domain: "email",
        title: getHeader(headers, "Subject"),
        content: msgData.snippet,
        metadata: {
          gmailId: msgData.id,
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          date: getHeader(headers, "Date"),
        },
      });
      recordsSynced++;
    }

    return { recordsSynced };
  },
};
