import nodemailer from "nodemailer";

async function getGmailAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail OAuth credentials not configured (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN)");
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

  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function markdownToHtml(md: string): string {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  let inPre = false;
  for (const raw of lines) {
    const line = raw;
    if (line.startsWith("```")) {
      if (inPre) { html += "</pre>"; inPre = false; } else { html += "<pre>"; inPre = true; }
      continue;
    }
    if (inPre) { html += escape(line) + "\n"; continue; }
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    if (/^#\s+/.test(line)) { closeList(); html += `<h1>${escape(line.replace(/^#\s+/, ""))}</h1>`; continue; }
    if (/^##\s+/.test(line)) { closeList(); html += `<h2>${escape(line.replace(/^##\s+/, ""))}</h2>`; continue; }
    if (/^###\s+/.test(line)) { closeList(); html += `<h3>${escape(line.replace(/^###\s+/, ""))}</h3>`; continue; }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${formatInline(escape(line.replace(/^[-*]\s+/, "")))}</li>`;
      continue;
    }
    closeList();
    if (line.trim() === "") { html += "<br/>"; continue; }
    html += `<p>${formatInline(escape(line))}</p>`;
  }
  if (inList) html += "</ul>";
  if (inPre) html += "</pre>";
  return html;
}

function formatInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function buildMime(to: string, from: string, subject: string, text: string, html: string): string {
  const boundary = `bnd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");
  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    text,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    html,
    `--${boundary}--`,
  ].join("\r\n");
  return `${headers}\r\n\r\n${body}`;
}

async function sendViaGmailApi(to: string, subject: string, body: string): Promise<{ id: string }> {
  const accessToken = await getGmailAccessToken();
  const from = process.env.GMAIL_FROM ?? to;
  const html = markdownToHtml(body);
  const mime = buildMime(to, from, subject, body, html);
  const raw = Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    throw new Error(`Gmail API send failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

async function sendViaSmtp(to: string, subject: string, body: string): Promise<{ id: string }> {
  const user = process.env.GMAIL_SMTP_USER ?? process.env.GMAIL_FROM;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("SMTP not configured: set GMAIL_SMTP_USER (or GMAIL_FROM) and GMAIL_APP_PASSWORD");
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  const info = await transporter.sendMail({
    from: user,
    to,
    subject,
    text: body,
    html: markdownToHtml(body),
  });
  return { id: info.messageId };
}

export async function sendEmail(to: string, subject: string, body: string): Promise<{ id: string }> {
  const transport = (process.env.EMAIL_TRANSPORT ?? "auto").toLowerCase();
  const hasSmtp = !!process.env.GMAIL_APP_PASSWORD;
  const hasOAuth =
    !!process.env.GMAIL_CLIENT_ID &&
    !!process.env.GMAIL_CLIENT_SECRET &&
    !!process.env.GMAIL_REFRESH_TOKEN;

  if (transport === "smtp") return sendViaSmtp(to, subject, body);
  if (transport === "gmail") return sendViaGmailApi(to, subject, body);

  if (hasSmtp) return sendViaSmtp(to, subject, body);
  if (hasOAuth) return sendViaGmailApi(to, subject, body);

  throw new Error(
    "No email transport configured. Set GMAIL_APP_PASSWORD (preferred for SMTP) or GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN with gmail.send scope.",
  );
}
