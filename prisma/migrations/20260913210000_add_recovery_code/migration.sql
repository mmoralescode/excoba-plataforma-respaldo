-- No existing accounts, licenses, sessions or learning records are rewritten.
ALTER TABLE "User" ADD COLUMN "recoveryCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryCodeCreatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "recoveryCodeUsedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_recoveryCodeHash_key" ON "User"("recoveryCodeHash");
