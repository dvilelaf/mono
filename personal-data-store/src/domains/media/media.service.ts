import { db } from "../../db/index.js";
import { filmReviews } from "./film-reviews.schema.js";
import { eq, asc, desc } from "drizzle-orm";

export async function getEloMatchup(seenPairs: string[]) {
  const films = await db
    .select({
      id: filmReviews.id,
      title: filmReviews.title,
      rating: filmReviews.rating,
      eloScore: filmReviews.eloScore,
      eloMatches: filmReviews.eloMatches,
      imageUrl: filmReviews.imageUrl,
    })
    .from(filmReviews)
    .orderBy(asc(filmReviews.eloMatches));

  if (films.length < 2) throw new Error("Not enough films for a matchup");

  const seenSet = new Set(seenPairs);
  const quartileSize = Math.max(20, Math.floor(films.length / 4));
  const candidatesA = films.slice(0, quartileSize);

  for (let attempt = 0; attempt < 15; attempt++) {
    const filmA = candidatesA[Math.floor(Math.random() * candidatesA.length)];
    const eloA = parseFloat(filmA.eloScore);

    const sortedByProximity = films
      .filter((f) => f.id !== filmA.id)
      .sort((a, b) => Math.abs(parseFloat(a.eloScore) - eloA) - Math.abs(parseFloat(b.eloScore) - eloA));

    for (const filmB of sortedByProximity.slice(0, 30)) {
      const pairKey = [filmA.id, filmB.id].sort().join(":");
      if (!seenSet.has(pairKey)) {
        return {
          filmA: { id: filmA.id, title: filmA.title, rating: filmA.rating, elo_score: filmA.eloScore, elo_matches: filmA.eloMatches, image_url: filmA.imageUrl },
          filmB: { id: filmB.id, title: filmB.title, rating: filmB.rating, elo_score: filmB.eloScore, elo_matches: filmB.eloMatches, image_url: filmB.imageUrl },
        };
      }
    }
  }

  // Fallback: pick any two unseen pair, or just the first two
  const [a, b] = films;
  return {
    filmA: { id: a.id, title: a.title, rating: a.rating, elo_score: a.eloScore, elo_matches: a.eloMatches, image_url: a.imageUrl },
    filmB: { id: b.id, title: b.title, rating: b.rating, elo_score: b.eloScore, elo_matches: b.eloMatches, image_url: b.imageUrl },
  };
}

export async function processEloComparison(winnerId: string, loserId: string) {
  const [winner] = await db.select().from(filmReviews).where(eq(filmReviews.id, winnerId)).limit(1);
  const [loser] = await db.select().from(filmReviews).where(eq(filmReviews.id, loserId)).limit(1);

  if (!winner || !loser) throw new Error("Film not found");

  const winnerScore = parseFloat(winner.eloScore);
  const loserScore = parseFloat(loser.eloScore);
  const kWinner = winner.eloMatches < 10 ? 32 : 16;
  const kLoser = loser.eloMatches < 10 ? 32 : 16;

  const expectedWinner = 1 / (1 + Math.pow(10, (loserScore - winnerScore) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinnerScore = winnerScore + kWinner * (1 - expectedWinner);
  const newLoserScore = loserScore + kLoser * (0 - expectedLoser);

  await db
    .update(filmReviews)
    .set({ eloScore: String(newWinnerScore), eloMatches: winner.eloMatches + 1, updatedAt: new Date() })
    .where(eq(filmReviews.id, winnerId));

  await db
    .update(filmReviews)
    .set({ eloScore: String(newLoserScore), eloMatches: loser.eloMatches + 1, updatedAt: new Date() })
    .where(eq(filmReviews.id, loserId));

  return {
    winner: { id: winner.id, title: winner.title, new_elo: Math.round(newWinnerScore), change: Math.round(newWinnerScore - winnerScore) },
    loser: { id: loser.id, title: loser.title, new_elo: Math.round(newLoserScore), change: Math.round(newLoserScore - loserScore) },
    matchesCompleted: winner.eloMatches + loser.eloMatches + 2,
  };
}

export async function getEloRankings(limit = 100) {
  return db
    .select({
      id: filmReviews.id,
      title: filmReviews.title,
      rating: filmReviews.rating,
      eloScore: filmReviews.eloScore,
      eloMatches: filmReviews.eloMatches,
      imageUrl: filmReviews.imageUrl,
    })
    .from(filmReviews)
    .orderBy(desc(filmReviews.eloScore))
    .limit(limit);
}
