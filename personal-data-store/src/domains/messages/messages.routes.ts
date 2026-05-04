import { Router } from "express";
import { db } from "../../db/index.js";
import { messages } from "./messages.schema.js";
import { desc, eq } from "drizzle-orm";
import { createMessage, deliverMessage } from "./messages.service.js";

export const messagesRouter = Router();

const DEFAULT_RECIPIENT = process.env.MESSAGES_DEFAULT_TO ?? "j.kou.bowles@gmail.com";

messagesRouter.get("/", async (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
  const rows = await db
    .select()
    .from(messages)
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  res.json({ messages: rows });
});

messagesRouter.get("/:id", async (req, res) => {
  const [row] = await db.select().from(messages).where(eq(messages.id, req.params.id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

messagesRouter.post("/", async (req, res) => {
  const { type, subject, body, metadata, send, to } = (req.body ?? {}) as {
    type?: string;
    subject?: string;
    body?: string;
    metadata?: Record<string, unknown>;
    send?: boolean;
    to?: string;
  };

  if (!subject || !body) {
    res.status(400).json({ error: "subject and body are required" });
    return;
  }

  const row = await createMessage({ type, subject, body, metadata });

  let delivery: { delivered: boolean; error?: string; gmailId?: string } | null = null;
  if (send !== false) {
    delivery = await deliverMessage(row.id, to ?? DEFAULT_RECIPIENT);
  }

  res.status(201).json({ message: row, delivery });
});

messagesRouter.post("/:id/send", async (req, res) => {
  const { to } = (req.body ?? {}) as { to?: string };
  const delivery = await deliverMessage(req.params.id, to ?? DEFAULT_RECIPIENT);
  res.json(delivery);
});
