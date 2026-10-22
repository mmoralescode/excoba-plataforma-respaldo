import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/db/client";
import { hashPassword } from "@/lib/security/password";
import { hashToken } from "@/lib/security/tokens";
import { generateRecoveryCode, hashRecoveryCode } from "@/lib/security/recovery-code";
import { isLicenseAvailableForActivation, licenseActivationDates } from "@/lib/license-validity";

export const RegisterInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(128),
  name: z.string().trim().min(2).max(120),
  licenseId: z.string().uuid(),
  folio: z.string().trim().toUpperCase().min(10).max(32),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;
export class RegisterError extends Error {}
const REGISTRATION_ERROR = "No fue posible completar el registro con estos datos.";

/** A license ID alone is never proof: recheck the secret and atomically claim it. */
export async function registerUser(input: RegisterInput) {
  const parsed = RegisterInputSchema.parse(input);
  const data = { ...parsed, email: parsed.email.toLowerCase() };
  const codeHash = hashToken(data.folio);
  // Slow hashing stays outside the transaction; eligibility is checked after it.
  const passwordHash = await hashPassword(data.password);
  const recoveryCode = generateRecoveryCode();

  try {
    return await db.$transaction(async (tx) => {
      const license = await tx.license.findUnique({ where: { id: data.licenseId } });
      if (!license || license.codeHash !== codeHash || !isLicenseAvailableForActivation(license)) {
        throw new RegisterError(REGISTRATION_ERROR);
      }
      const alumnoRole = await tx.role.findUniqueOrThrow({ where: { name: "ALUMNO" } });
      const created = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          recoveryCodeHash: hashRecoveryCode(recoveryCode),
          recoveryCodeCreatedAt: new Date(),
          name: data.name,
          roles: { create: { roleId: alumnoRole.id } },
        },
      });
      // Refresh after user creation: an earlier validation is not a reservation.
      const now = new Date();
      const claimed = await tx.license.updateMany({
        where: {
          id: license.id,
          codeHash,
          userId: null,
          activatedAt: null,
          status: { in: ["CREADA", "ASIGNADA"] },
          // Reject concurrent edits to the policy instead of overwriting them.
          validityMonths: license.validityMonths,
          careerScope: license.careerScope,
          selectedCareerId: null,
          startsAt: license.startsAt,
          expiresAt: license.expiresAt,
          AND: [
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          ],
        },
        data: {
          userId: created.id,
          status: "ACTIVADA",
          ...licenseActivationDates(license, now),
        },
      });
      if (claimed.count !== 1) throw new RegisterError(REGISTRATION_ERROR);
      await tx.licenseEvent.create({
        data: {
          licenseId: license.id,
          type: "ACTIVACION",
          reason: "Registro de alumno completado.",
        },
      });
      return { id: created.id, email: created.email, recoveryCode };
    });
  } catch (error) {
    // The email unique constraint also handles simultaneous registrations.
    // Any failure rolls back the user, role association and license claim.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new RegisterError(REGISTRATION_ERROR);
    }
    throw error;
  }
}
