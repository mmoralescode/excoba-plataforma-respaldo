-- Private, account-bound feedback; no existing accounts or licenses are changed.
CREATE TYPE "FeedbackCategory" AS ENUM ('SUGERENCIA', 'ERROR');
CREATE TYPE "FeedbackSection" AS ENUM ('GENERAL', 'INSTRUCTIVO', 'PRACTICA', 'SIMULADOR', 'PERFIL', 'OTRO');
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "section" "FeedbackSection" NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "submissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "Feedback_userId_submissionId_key" ON "Feedback"("userId", "submissionId");
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");
CREATE INDEX "Feedback_createdAt_id_idx" ON "Feedback"("createdAt", "id");
