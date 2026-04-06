import express from "express";
import { apiKeyAuth } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";

export const app = express();

app.use(express.json());

// Health check (no auth)
app.get("/api/system/health", (_req, res) => {
  res.json({ status: "ok" });
});

// All /api routes require auth
app.use("/api", apiKeyAuth);

// Domain routers will be registered here as they're built

app.use(errorHandler);
