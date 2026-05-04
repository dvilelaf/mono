import { db } from "../../db/index.js";
import { messages } from "./messages.schema.js";
import { eq } from "drizzle-orm";
import { sendEmail } from "../../services/email.js";
import { sendNtfy, summarize, frontendUrl } from "../../services/ntfy.js";

export type CreateMessageInput = {
  type?: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
};

const TYPE_TAGS: Record<string, string[]> = {
  digest: ["newspaper"],
  growth: ["seedling"],
  synthesis: ["brain"],
  default: ["envelope"],
};

const TYPE_DEFAULT_PATH: Record<string, string> = {
  digest: "/digest",
  growth: "/inbox",
  synthesis: "/inbox",
};

function clickUrlFor(type: string, metadata: Record<string, unknown>, messageId: string): string {
  const explicit = metadata.clickUrl;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;

  const documentId = metadata.documentId;
  if (typeof documentId === "string") return frontendUrl(`/documents?id=${documentId}`);

  const path = TYPE_DEFAULT_PATH[type] ?? "/inbox";
  return frontendUrl(`${path}?message=${messageId}`);
}

export async function createMessage(input: CreateMessageInput) {
  const type = input.type ?? "synthesis";
  const metadata = input.metadata ?? {};
  const [row] = await db
    .insert(messages)
    .values({
      type,
      subject: input.subject,
      body: input.body,
      metadata,
    })
    .returning();

  const summarySource =
    typeof metadata.summary === "string" && metadata.summary.length > 0
      ? metadata.summary
      : input.body;
  const ntfyMessage = summarize(summarySource);
  const click = clickUrlFor(type, metadata, row.id);
  const tags = TYPE_TAGS[type] ?? TYPE_TAGS.default;

  const result = await sendNtfy({
    title: input.subject,
    message: ntfyMessage,
    click,
    priority: 3,
    tags,
  });

  if (result.ok) {
    await db
      .update(messages)
      .set({
        delivered: true,
        deliveredAt: new Date(),
        metadata: { ...metadata, ntfy: { delivered: true, click, summary: ntfyMessage } },
      })
      .where(eq(messages.id, row.id));
  } else {
    await db
      .update(messages)
      .set({
        metadata: { ...metadata, ntfy: { delivered: false, error: result.error, click } },
      })
      .where(eq(messages.id, row.id));
    console.error(`[messages] ntfy delivery failed for ${row.id}:`, result.error);
  }

  return row;
}

export async function deliverMessage(
  id: string,
  to: string,
): Promise<{ delivered: boolean; error?: string; gmailId?: string }> {
  const [msg] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!msg) throw new Error(`Message not found: ${id}`);
  try {
    const result = await sendEmail(to, msg.subject, msg.body);
    await db
      .update(messages)
      .set({ delivered: true, deliveredAt: new Date() })
      .where(eq(messages.id, id));
    return { delivered: true, gmailId: result.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(messages)
      .set({
        metadata: { ...((msg.metadata as Record<string, unknown>) ?? {}), lastError: message },
      })
      .where(eq(messages.id, id));
    return { delivered: false, error: message };
  }
}
