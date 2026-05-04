import { pgTable, uuid, text, integer, numeric, date, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const filmReviews = pgTable(
  "film_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug"),
    yearReleased: integer("year_released"),
    yearWatched: integer("year_watched"),
    dateWatched: date("date_watched"),
    body: text("body"),
    context: text("context"),
    rating: numeric("rating").notNull(),
    eloScore: numeric("elo_score").notNull().default("1500"),
    eloMatches: integer("elo_matches").notNull().default(0),
    imageUrl: text("image_url"),
    externalIds: jsonb("external_ids"),
    tags: text("tags").array(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("film_reviews_status_idx").on(table.status),
    index("film_reviews_elo_idx").on(table.eloScore),
  ]
);
