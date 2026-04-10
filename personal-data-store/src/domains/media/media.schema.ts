import { pgTable, uuid, text, timestamp, jsonb, index, unique, boolean, doublePrecision } from "drizzle-orm/pg-core";

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filename: text("filename").notNull(),
    originalFilename: text("original_filename"),
    date: timestamp("date", { withTimezone: true }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    placeName: text("place_name"),
    city: text("city"),
    country: text("country"),
    isPhoto: boolean("is_photo").notNull().default(true),
    isVideo: boolean("is_video").notNull().default(false),
    persons: jsonb("persons"),
    labels: jsonb("labels"),
    albums: jsonb("albums"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("photos_date_idx").on(table.date),
    index("photos_place_idx").on(table.city, table.country),
    unique("photos_filename_uniq").on(table.filename),
  ]
);
