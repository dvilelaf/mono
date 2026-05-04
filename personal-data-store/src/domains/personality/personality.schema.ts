import { pgTable, uuid, text, integer, timestamp, index, unique } from "drizzle-orm/pg-core";

export const personalityAssessments = pgTable(
  "personality_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    externalId: text("external_id"),
    resultUrl: text("result_url"),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("personality_assessments_source_taken_idx").on(table.source, table.takenAt),
    unique("personality_assessments_source_external_uniq").on(table.source, table.externalId),
  ],
);

export const personalityAssessmentAnswers = pgTable(
  "personality_assessment_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => personalityAssessments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    questionId: text("question_id").notNull(),
    questionText: text("question_text").notNull(),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("personality_answers_assessment_idx").on(table.assessmentId),
    unique("personality_answers_assessment_position_uniq").on(table.assessmentId, table.position),
  ],
);
