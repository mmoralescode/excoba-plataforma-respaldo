import { z } from "zod";
import { db } from "@/db/client";
import { generateLicenseFolio, hashToken } from "@/lib/security/tokens";
import { sendLicenseAssignedEmail } from "@/lib/email/mailer";

export const CreateLicenseInputSchema = z.object({
  productId: z.string().uuid().or(z.string().min(1)),
  assignToEmail: z.string().email().optional(),
  maxActivations: z.number().int().min(1).default(1),
  expiresAt: z.coerce.date().optional(),
  createdByAdminId: z.string().uuid(),
});

export type CreateLicenseInput = z.infer<typeof CreateLicenseInputSchema>;

/**
 * Crea una licencia con un folio nuevo. Si se indica `assignToEmail`, el
 * folio se envía por correo y la licencia pasa a estado ASIGNADA; si no,
 * queda en CREADA para asignación posterior por soporte/admin.
 *
 * El folio en texto plano SOLO existe en este momento (retorno de la
 * función y correo enviado); en base de datos únicamente se guarda su hash
 * y los últimos 4 caracteres.
 */
export async function createLicense(input: CreateLicenseInput) {
  const data = CreateLicenseInputSchema.parse(input);
  const folio = generateLicenseFolio();

  const license = await db.license.create({
    data: {
      productId: data.productId,
      codeHash: hashToken(folio),
      codeLastFour: folio.slice(-4),
      maxActivations: data.maxActivations,
      expiresAt: data.expiresAt,
      status: data.assignToEmail ? "ASIGNADA" : "CREADA",
      assignedAt: data.assignToEmail ? new Date() : null,
      createdByAdminId: data.createdByAdminId,
    },
  });

  await db.licenseEvent.create({
    data: {
      licenseId: license.id,
      type: data.assignToEmail ? "ASIGNACION" : "CREACION",
      adminId: data.createdByAdminId,
    },
  });

  if (data.assignToEmail) {
    await sendLicenseAssignedEmail(data.assignToEmail, folio);
  }

  return { license, folio };
}
