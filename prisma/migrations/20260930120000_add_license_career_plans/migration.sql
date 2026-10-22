-- Additive: no accounts, progress, content or existing license history is removed.
CREATE TYPE "LicenseCareerScope" AS ENUM ('ALL_CAREERS', 'SINGLE_CAREER');
ALTER TABLE "License"
  ADD COLUMN "careerScope" "LicenseCareerScope" NOT NULL DEFAULT 'ALL_CAREERS',
  ADD COLUMN "selectedCareerId" TEXT,
  ADD COLUMN "careerSelectedAt" TIMESTAMP(3);

-- Pre-existing licenses retain their previous all-career access. New issuance
-- explicitly assigns SINGLE_CAREER for two months and ALL_CAREERS for four.
ALTER TABLE "License" ADD CONSTRAINT "License_career_selection_pair"
  CHECK (("selectedCareerId" IS NULL) = ("careerSelectedAt" IS NULL));
