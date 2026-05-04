CREATE TABLE "personality_assessment_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question_id" text NOT NULL,
	"question_text" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personality_answers_assessment_position_uniq" UNIQUE("assessment_id","position")
);
--> statement-breakpoint
CREATE TABLE "personality_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"result_url" text,
	"taken_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personality_assessments_source_external_uniq" UNIQUE("source","external_id")
);
--> statement-breakpoint
ALTER TABLE "personality_assessment_answers" ADD CONSTRAINT "personality_assessment_answers_assessment_id_personality_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."personality_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "personality_answers_assessment_idx" ON "personality_assessment_answers" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "personality_assessments_source_taken_idx" ON "personality_assessments" USING btree ("source","taken_at");