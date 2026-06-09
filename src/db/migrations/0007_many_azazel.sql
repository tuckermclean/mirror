DROP INDEX "outcomes_user_id_idx";--> statement-breakpoint
CREATE INDEX "outcomes_user_id_week_of_idx" ON "outcomes" USING btree ("user_id","week_of");--> statement-breakpoint
CREATE UNIQUE INDEX "outcomes_user_week_source_idx" ON "outcomes" USING btree ("user_id","week_of","source");--> statement-breakpoint
ALTER TABLE "benchmark_profiles" ADD CONSTRAINT "benchmark_profiles_public_url_unique" UNIQUE("public_url");--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_source_check" CHECK ("outcomes"."source" IN ('self_report', 'extension'));
