-- Additive: previous answers keep their original IDs and grading.
ALTER TABLE "AttemptAnswer" ADD COLUMN "response" JSONB;
ALTER TABLE "AttemptAnswer" ADD COLUMN "credit" DOUBLE PRECISION;
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_credit_range"
  CHECK ("credit" IS NULL OR ("credit" >= 0 AND "credit" <= 1));
