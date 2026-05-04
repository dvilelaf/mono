import express from "express";
import { apiKeyAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";
import { systemRouter } from "./system/system.routes.js";
import { aboutRouter } from "./system/about.routes.js";
import { healthRouter } from "./domains/health/health.routes.js";
import { genomicsRouter } from "./domains/genomics/genomics.routes.js";
import { financeRouter } from "./domains/finance/finance.routes.js";
import { businessRouter } from "./domains/business/business.routes.js";
import { documentsRouter } from "./domains/documents/documents.routes.js";
import { mediaRouter } from "./domains/media/media.routes.js";
import { messagesRouter } from "./domains/messages/messages.routes.js";
import { appleHealthWebhook } from "./webhooks/apple-health.webhook.js";

export const app = express();

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Webhook-Secret");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (_req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});
app.use(express.json({ limit: "50mb" }));

// Health check (no auth)
app.get("/api/system/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Webhooks (use their own secret, not the API key)
app.use("/webhooks", appleHealthWebhook);

// All /api routes require auth
app.use("/api", apiKeyAuth);

// Domain routers
app.use("/api/system", systemRouter);
app.use("/api/health", healthRouter);
app.use("/api/genomics", genomicsRouter);
app.use("/api/finance", financeRouter);
app.use("/api/business", businessRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/media", mediaRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/about", aboutRouter);

app.use(errorHandler);
