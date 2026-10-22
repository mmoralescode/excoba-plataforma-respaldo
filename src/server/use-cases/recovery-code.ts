import { z } from "zod";
import { db } from "@/db/client";
import { canAccessPlatform } from "@/lib/license-access";
import { hashPassword, verifyPassword } from "@/lib/security/password";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  isRecoveryCode,
} from "@/lib/security/recovery-code";

export class RecoveryCodeError extends Error {
  constructor() {
    super("No se pudo restablecer la contraseña. Revisa el correo y el código de recuperación.");
  }
}
export class RecoveryCodeGenerationError extends Error {
  constructor() {
    super(
      "No se pudo generar el código. Revisa tu contraseña actual y vuelve a iniciar sesión si es necesario.",
    );
  }
}
export const GenerateRecoveryCodeSchema = z
  .object({ currentPassword: z.string().min(1).max(128) })
  .strict();
export const RecoverWithCodeSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    code: z.string().min(1).max(100),
    newPassword: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(128),
    confirmPassword: z.string().min(10).max(128),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

/** Only status and timestamp are readable later; never return the stored digest. */
export async function getRecoveryCodeStatus(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { recoveryCodeHash: true, recoveryCodeCreatedAt: true, recoveryCodeUsedAt: true },
  });
  return {
    available: !!user?.recoveryCodeHash && !user.recoveryCodeUsedAt,
    createdAt: user?.recoveryCodeCreatedAt ?? null,
  };
}

/** A session by itself cannot replace the recovery secret: require the password. */
export async function generateAccountRecoveryCode(
  userId: string,
  sessionTokenHash: string,
  input: z.input<typeof GenerateRecoveryCodeSchema>,
) {
  const data = GenerateRecoveryCodeSchema.parse(input);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (
    !user ||
    user.status !== "ACTIVO" ||
    user.deletedAt ||
    !(await verifyPassword(user.passwordHash, data.currentPassword))
  ) {
    throw new RecoveryCodeGenerationError();
  }
  const code = generateRecoveryCode();
  return db.$transaction(
    async (tx) => {
      // Consistent User -> Session lock order with login and password recovery.
      const matching = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User" WHERE "id" = ${userId} AND "passwordHash" = ${user.passwordHash}
      AND "status" = 'ACTIVO' AND "deletedAt" IS NULL FOR UPDATE
    `;
      if (!matching.length) throw new RecoveryCodeGenerationError();
      const fresh = await tx.user.findUnique({
        where: { id: userId },
        include: { roles: { include: { role: true } }, license: true },
      });
      const now = new Date();
      if (!fresh || !canAccessPlatform(fresh, now)) throw new RecoveryCodeGenerationError();
      const sessions = await tx.$queryRaw<Array<{ id: string; expiresAt: Date }>>`
      SELECT "id", "expiresAt" FROM "Session" WHERE "userId" = ${userId} AND "sessionTokenHash" = ${sessionTokenHash}
      AND "revokedAt" IS NULL AND "expiresAt" > ${now} FOR UPDATE
    `;
      // Waiting for the row lock must not extend an expired session or license.
      const generatedAt = new Date();
      if (
        !sessions.length ||
        sessions[0]!.expiresAt <= generatedAt ||
        !canAccessPlatform(fresh, generatedAt)
      ) {
        throw new RecoveryCodeGenerationError();
      }
      // Concurrent rotation cannot silently replace a code returned by another request.
      const changed = await tx.user.updateMany({
        where: {
          id: userId,
          passwordHash: user.passwordHash,
          recoveryCodeHash: user.recoveryCodeHash,
        },
        data: {
          recoveryCodeHash: hashRecoveryCode(code),
          recoveryCodeCreatedAt: generatedAt,
          recoveryCodeUsedAt: null,
        },
      });
      if (changed.count !== 1) throw new RecoveryCodeGenerationError();
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "RECOVERY_CODE_GENERATED",
          entity: "User",
          entityId: userId,
          metadata: { replacedPrevious: !!user.recoveryCodeHash },
        },
      });
      return { code, createdAt: generatedAt };
    },
    { timeout: 15000 },
  );
}

/** Public recovery: same error for absent/disabled/used/wrong-account secrets. */
export async function recoverPasswordWithCode(input: z.input<typeof RecoverWithCodeSchema>) {
  const data = RecoverWithCodeSchema.parse(input);
  if (!isRecoveryCode(data.code)) throw new RecoveryCodeError();
  const recoveryCodeHash = hashRecoveryCode(data.code);
  const user = await db.user.findUnique({ where: { email: data.email } });
  if (
    !user ||
    user.status !== "ACTIVO" ||
    user.deletedAt ||
    user.recoveryCodeUsedAt ||
    user.recoveryCodeHash !== recoveryCodeHash
  ) {
    throw new RecoveryCodeError();
  }
  // Expired licenses can change a password, but this never grants platform access.
  const passwordHash = await hashPassword(data.newPassword);
  await db.$transaction(
    async (tx) => {
      const now = new Date();
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          email: data.email,
          status: "ACTIVO",
          deletedAt: null,
          passwordHash: user.passwordHash,
          recoveryCodeHash,
          recoveryCodeUsedAt: null,
        },
        data: { passwordHash, recoveryCodeUsedAt: now },
      });
      if (changed.count !== 1) throw new RecoveryCodeError();
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "PASSWORD_RESET_WITH_RECOVERY_CODE",
          entity: "User",
          entityId: user.id,
          metadata: {},
        },
      });
    },
    { timeout: 15000 },
  );
  return {
    message:
      "Contraseña actualizada. Tu código ya fue utilizado. Inicia sesión y genera uno nuevo en Perfil.",
  };
}
