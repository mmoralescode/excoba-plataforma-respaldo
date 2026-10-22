-- Additive migration: no default or backfill changes existing licenses.
ALTER TABLE "License" ADD COLUMN "validityMonths" INTEGER;
