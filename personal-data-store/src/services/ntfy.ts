const NTFY_BASE = process.env.NTFY_BASE_URL ?? "https://ntfy.sh";
const FRONTEND_BASE = process.env.PDS_FRONTEND_URL ?? "http://macbook-pro.tail0b19d9.ts.net:3001";

export type NtfyOptions = {
  title: string;
  message: string;
  click?: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
};

export function frontendUrl(path: string): string {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return `${FRONTEND_BASE}${trimmed}`;
}

export function summarize(body: string, maxChars = 280): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) ?? [];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > maxChars) break;
    out += s;
  }
  if (!out) out = cleaned.slice(0, maxChars - 1) + "…";
  return out.trim();
}

export async function sendNtfy(opts: NtfyOptions): Promise<{ ok: boolean; status?: number; error?: string }> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return { ok: false, error: "NTFY_TOPIC not set" };

  const payload: Record<string, unknown> = {
    topic,
    title: opts.title,
    message: opts.message,
    priority: opts.priority ?? 3,
  };
  if (opts.click) payload.click = opts.click;
  if (opts.tags && opts.tags.length) payload.tags = opts.tags;

  try {
    const res = await fetch(NTFY_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
