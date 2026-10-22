-- Explicit per-account permission. Existing and new accounts default to no access.
ALTER TABLE "User" ADD COLUMN "canReviewFeedback" BOOLEAN NOT NULL DEFAULT false;
