import type { AssertionFailure, AssertionResult } from "./assertions.js";

export interface ReportOutcome {
  posted: number;
  inserted: number;
  errors: string[];
}

interface AlertPayload {
  checkType: string;
  severity: "info" | "warning" | "critical";
  subject: string;
  title: string;
  detail?: string;
  fingerprint: string;
  metadata?: Record<string, unknown>;
}

function failureToAlert(f: AssertionFailure): AlertPayload {
  return {
    checkType: "wiki_eval",
    severity: f.severity,
    subject: f.subject,
    title: `wiki eval — ${f.check}: ${f.subject}`,
    detail: f.message,
    fingerprint: f.fingerprint,
    metadata: { fixture: f.fixture, check: f.check },
  };
}

export async function reportFailures(
  results: AssertionResult[],
  pdsApiUrl: string,
  apiKey: string | undefined,
): Promise<ReportOutcome> {
  const failures = results.flatMap((r) => r.failed);
  if (!failures.length) return { posted: 0, inserted: 0, errors: [] };

  const errors: string[] = [];
  let inserted = 0;
  let posted = 0;

  for (const f of failures) {
    posted++;
    try {
      const res = await fetch(`${pdsApiUrl}/api/watchdog/report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(failureToAlert(f)),
      });
      if (!res.ok) {
        errors.push(`${f.fingerprint}: ${res.status} ${await res.text()}`);
        continue;
      }
      const json = (await res.json()) as { inserted: boolean };
      if (json.inserted) inserted++;
    } catch (err) {
      errors.push(`${f.fingerprint}: ${(err as Error).message}`);
    }
  }
  return { posted, inserted, errors };
}
