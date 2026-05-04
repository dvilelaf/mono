import { db } from "../../db/index.js";
import { messages } from "./messages.schema.js";
import { eq } from "drizzle-orm";
import { sendEmail } from "../../services/email.js";

export type CreateMessageInput = {
  type?: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export async function createMessage(input: CreateMessageInput) {
  const [row] = await db
    .insert(messages)
    .values({
      type: input.type ?? "synthesis",
      subject: input.subject,
      body: input.body,
      metadata: input.metadata ?? {},
    })
    .returning();
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
