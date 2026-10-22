import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/db/client";
import { generateLicenseFolio, hashToken } from "@/lib/security/tokens";
import { DEFAULT_LICENSE_VALIDITY_MONTHS } from "@/lib/license-validity";
import { assertEmailConfigured, sendLicenseAssignedEmail } from "@/lib/email/mailer";

export const CreateLicenseInputSchema = z.object({
  productId: z.string().uuid().or(z.string().min(1)),
  assignToEmail: z.string().trim().email().optional(),
  maxActivations: z.literal(1).default(1),
  validityMonths: z.union([z.literal(2), z.literal(4)]).default(DEFAULT_LICENSE_VALIDITY_MONTHS),
  // A new license starts its term at registration, never at issuance.
  expiresAt: z.never().optional(),
  createdByAdminId: z.string().uuid(),
});

export type CreateLicenseInput = z.input<typeof CreateLicenseInputSchema>;
export class CreateLicenseError extends Error {}

function isFolioCollision(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes("codeHash")
    : typeof target === "string" && /(^|_)codeHash(_|$)/.test(target);
}

/** Plaintext exists only in the returned folio and optional recipient email. */
export async function createLicense(input: CreateLicenseInput) {
  const data = CreateLicenseInputSchema.parse(input);
  if (data.assignToEmail) assertEmailConfigured();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const folio = generateLicenseFolio();
    let license;
    try {
      license = await db.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: data.productId },
          select: { id: true, isActive: true },
        });
        if (!product?.isActive) throw new CreateLicenseError("El producto no está disponible.");
        const created = await tx.license.create({
          data: {
            productId: data.productId,
            codeHash: hashToken(folio),
            codeLastFour: folio.slice(-4),
            maxActivations: 1,
            validityMonths: data.validityMonths,
            careerScope: data.validityMonths === 2 ? "SINGLE_CAREER" : "ALL_CAREERS",
            startsAt: null,
            activatedAt: null,
            expiresAt: null,
            status: data.assignToEmail ? "ASIGNADA" : "CREADA",
            assignedAt: data.assignToEmail ? new Date() : null,
            createdByAdminId: data.createdByAdminId,
          },
        });
        await tx.licenseEvent.create({
          data: {
            licenseId: created.id,
            type: data.assignToEmail ? "ASIGNACION" : "CREACION",
            adminId: data.createdByAdminId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: data.createdByAdminId,
            action: "LICENSE_CREATED",
            entity: "License",
            entityId: created.id,
          },
        });
        return created;
      });
    } catch (error) {
      if (isFolioCollision(error)) continue;
      throw error;
    }

    let emailSent: boolean | null = null;
    if (data.assignToEmail) {
      try {
        await sendLicenseAssignedEmail(data.assignToEmail, folio);
        emailSent = true;
      } catch {
        // The license has committed: return its only plaintext copy even if
        // delivery fails, so a retry cannot silently create a replacement.
        emailSent = false;
      }
    }
    return { license, folio, emailSent };
  }
  throw new CreateLicenseError("No fue posible generar un folio único. Intenta nuevamente.");
}
