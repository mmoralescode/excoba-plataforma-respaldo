import { z } from "zod";
import { db } from "@/db/client";
import { hashToken } from "@/lib/security/tokens";

export const ValidateFolioInputSchema = z.object({
  folio: z.string().min(10).max(32),
});

export class InvalidFolioError extends Error {}

/**
 * Valida un folio para permitir continuar al formulario de registro.
 *
 * No revela CUÁL condición falló (folio inexistente, ya usado, suspendido,
 * expirado, etc.) — siempre el mismo mensaje genérico — para no facilitar
 * enumeración de folios válidos (ver Módulo 1, sección 12).
 */
export async function validateLicenseFolio(input: z.infer<typeof ValidateFolioInputSchema>) {
  const { folio } = ValidateFolioInputSchema.parse(input);
  const codeHash = hashToken(folio.trim().toUpperCase());

  const license = await db.license.findUnique({ where: { codeHash } });

  const isUsable =
    license &&
    !license.userId &&
    (license.status === "CREADA" || license.status === "ASIGNADA") &&
    (!license.expiresAt || license.expiresAt > new Date());

  if (!isUsable) {
    throw new InvalidFolioError("El folio no es válido, ya fue utilizado o expiró.");
  }

  return license;
}
