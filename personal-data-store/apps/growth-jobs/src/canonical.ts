/**
 * Fetch canonical reference documents from the PDS for a given list of topic
 * slugs and format them as a single text block to inject into the job prompt.
 *
 * Returns an empty string when no topics are configured or no docs match —
 * callers can blindly include the result in the preamble.
 */
export async function fetchCanonicalBlock(
  pdsApiUrl: string,
  topics: string[],
  apiKey?: string,
): Promise<string> {
  if (!topics.length) return "";
  const url = `${pdsApiUrl}/api/canonical?topics=${encodeURIComponent(topics.join(","))}`;
  try {
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) {
      console.error(`[canonical] fetch ${res.status}: ${await res.text()}`);
      return "";
    }
    const json = (await res.json()) as {
      documents: Array<{ id: string; title: string | null; content: string | null; canonical_for: string[] | null }>;
    };
    if (!json.documents?.length) {
      return [
        "<canonical-references>",
        `No canonical reference documents are tagged for topics: ${topics.join(", ")}.`,
        "Be explicit about this absence in any analysis touching these areas.",
        "</canonical-references>",
      ].join("\n");
    }
    const lines = ["<canonical-references>"];
    lines.push(
      `Below are the user's canonical reference documents for: ${topics.join(", ")}.`,
      "Ground analysis in this material first; cite by title when used.",
      "",
    );
    for (const doc of json.documents) {
      lines.push(`<doc id="${doc.id}" title="${doc.title ?? "untitled"}" topics="${(doc.canonical_for ?? []).join(",")}">`);
      lines.push(doc.content ?? "");
      lines.push(`</doc>`);
      lines.push("");
    }
    lines.push("</canonical-references>");
    return lines.join("\n");
  } catch (err) {
    console.error("[canonical] fetch threw:", err);
    return "";
  }
}
