import type { Connector, SyncResult } from "../connector.interface.js";
import { db } from "../../db/index.js";
import { documents } from "../../domains/documents/documents.schema.js";
import { and, eq, desc, sql } from "drizzle-orm";
import { researchInterest } from "./research.js";
import { generateDigestArticle, type PreviousArticle } from "./generator.js";
import { createMessage } from "../../domains/messages/messages.service.js";

interface InterestDoc {
  id: string;
  title: string | null;
  content: string | null;
  metadata: unknown;
}

function collectSeenUrls(rawRows: { metadata: unknown }[]): Set<string> {
  const seen = new Set<string>();
  for (const row of rawRows) {
    const meta = row.metadata as Record<string, unknown> | null;
    const sources = meta?.sources;
    if (Array.isArray(sources)) {
      for (const url of sources) {
        if (typeof url === "string") seen.add(url);
      }
    }
  }
  return seen;
}

export async function runDigestCycle(): Promise<{ articles: { title: string; content: string; id: string }[] }> {
  const interests = (await db
    .select()
    .from(documents)
    .where(eq(documents.type, "interest"))) as InterestDoc[];

  const activeInterests = interests.filter((i) => {
    const meta = i.metadata as Record<string, unknown> | null;
    return meta?.active !== false;
  });

  if (activeInterests.length === 0) {
    console.log("[digest] No active interests found");
    return { articles: [] };
  }

  const articles: { title: string; content: string; id: string }[] = [];
  const processedIds: string[] = [];
  const errors: string[] = [];

  for (const interest of activeInterests) {
    try {
      const meta = (interest.metadata as Record<string, unknown>) ?? {};

      // Fetch previous articles for context
      const prevRows = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.type, "digest"),
            sql`${documents.metadata}->>'interestId' = ${interest.id}`
          )
        )
        .orderBy(desc(documents.createdAt))
        .limit(3);

      const previousArticles: PreviousArticle[] = prevRows.map((r) => ({
        title: r.title ?? "",
        content: r.content ?? "",
        createdAt: r.createdAt,
      }));

      const seenUrls = collectSeenUrls(prevRows);

      const research = await researchInterest({
        id: interest.id,
        title: interest.title ?? "Untitled",
        content: interest.content ?? "",
        metadata: meta,
      });

      // Collect all source URLs from this run's research
      const sourceUrls = research.flatMap((r) => r.results.map((s) => s.url));
      const newUrls = sourceUrls.filter((u) => !seenUrls.has(u));
      const allUrls = [...new Set(sourceUrls)];

      if (seenUrls.size > 0) {
        const totalResults = research.reduce((sum, r) => sum + r.results.length, 0);
        console.log(`[digest] ${interest.title}: ${newUrls.length}/${totalResults} results are new URLs`);
      }

      const articleContent = await generateDigestArticle(
        interest.title ?? "Untitled",
        interest.content ?? "",
        research,
        previousArticles
      );

      const [saved] = await db
        .insert(documents)
        .values({
          domain: "digest",
          type: "digest",
          title: `${interest.title} — ${new Date().toISOString().split("T")[0]}`,
          content: articleContent,
          metadata: {
            interestId: interest.id,
            interestTitle: interest.title,
            researchQueries: research.map((r) => r.query),
            resultCount: research.reduce((sum, r) => sum + r.results.length, 0),
            sources: allUrls,
            newSourceCount: newUrls.length,
            previousArticleCount: previousArticles.length,
            generatedAt: new Date().toISOString(),
          },
        })
        .returning();

      articles.push({ title: saved.title ?? "", content: articleContent, id: saved.id });
      processedIds.push(interest.id);
      console.log(`[digest] Generated article for: ${interest.title}`);

      try {
        await createMessage({
          type: "digest",
          subject: `New Digest: ${saved.title}`,
          body: articleContent,
          metadata: {
            documentId: saved.id,
            interestId: interest.id,
            interestTitle: interest.title,
            sourceCount: allUrls.length,
            newSourceCount: newUrls.length,
          },
        });
      } catch (msgErr) {
        console.error(`[digest] message create failed for ${saved.id}:`, msgErr);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${interest.title}: ${msg}`);
      console.error(`[digest] Failed for ${interest.title}:`, msg);
    }
  }

  await db.insert(documents).values({
    domain: "digest",
    type: "digest-run",
    title: `Digest run — ${new Date().toISOString()}`,
    content: `Processed ${processedIds.length} interests, generated ${articles.length} articles.`,
    metadata: {
      processedInterests: processedIds,
      articleCount: articles.length,
      errors,
      runAt: new Date().toISOString(),
    },
  });

  return { articles };
}

export const digestConnector: Connector = {
  name: "digest",
  schedule: null,

  async sync(): Promise<SyncResult> {
    const { articles } = await runDigestCycle();
    return { recordsSynced: articles.length };
  },
};
