import { z } from "zod";
import { db } from "@/db/client";
import { hashToken } from "@/lib/security/tokens";
import { isLicenseAvailableForActivation } from "@/lib/license-validity";

export const ValidateFolioInputSchema = z.object({
  folio: z.string().trim().toUpperCase().min(10).max(32),
});

export class InvalidFolioError extends Error {}

/** Preview only: registration must recheck the secret, dates and unclaimed state. */
export async function validateLicenseFolio(input: z.infer<typeof ValidateFolioInputSchema>) {
  const { folio } = ValidateFolioInputSchema.parse(input);
  const license = await db.license.findUnique({ where: { codeHash: hashToken(folio) } });
  if (!isLicenseAvailableForActivation(license)) {
    throw new InvalidFolioError("El folio no es válido, ya fue utilizado o expiró.");
  }
  return license;
}
