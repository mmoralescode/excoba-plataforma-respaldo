import { z } from "zod";
import { db } from "@/db/client";
import { hashPassword } from "@/lib/security/password";
import { generateRandomToken, hashToken } from "@/lib/security/tokens";
import {
  assertEmailConfigured,
  EmailDeliveryError,
  sendPasswordResetEmail,
} from "@/lib/email/mailer";

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const PASSWORD_RESET_MESSAGE =
  "Si el correo corresponde a una cuenta habilitada y el servicio está disponible, recibirás un enlace para restablecer tu contraseña.";

export const RequestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
});
export const ResetPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  newPassword: z.string().min(10, "La contraseña debe tener al menos 10 caracteres.").max(128),
});

export async function requestPasswordReset(input: z.input<typeof RequestPasswordResetSchema>) {
  const { email } = RequestPasswordResetSchema.parse(input);
  assertEmailConfigured();
  const token = generateRandomToken();
  const tokenHash = hashToken(token);
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true, deletedAt: true },
  });

  // Recovery cannot reactivate a suspended or deleted account.
  if (user && user.status === "ACTIVO" && !user.deletedAt) {
    try {
      const created = await db.$transaction(async (tx) => {
        // Serialize per-account requests across serverless instances without a new table.
        // This does not change user data: the row lock is held until transaction commit.
        const active = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User"
        WHERE "id" = ${user.id} AND "status" = 'ACTIVO' AND "deletedAt" IS NULL
        FOR UPDATE
      `;
        if (!active.length) return false;
        const recent = await tx.passwordResetToken.count({
          where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
        });
        if (recent >= 3) return false;
        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });
        return true;
      });
      if (created) {
        try {
          await sendPasswordResetEmail(user.email, token);
        } catch (error) {
          // Recipient-specific rejection must not produce a different public status.
          console.error("[password-reset] email_not_accepted", {
            code: error instanceof EmailDeliveryError ? error.code : "UNEXPECTED",
            status: error instanceof EmailDeliveryError ? error.status : undefined,
          });
          // Never leave a usable link after an unconfirmed send (including timeouts).
          await db.passwordResetToken.updateMany({
            where: { tokenHash, usedAt: null },
            data: { usedAt: new Date() },
          });
        }
      }
    } catch {
      // Account-specific DB/send failures must not distinguish an existing email.
      console.error("[password-reset] issuance_failed", { code: "INTERNAL" });
    }
  }
  return { message: PASSWORD_RESET_MESSAGE };
}

export class ResetPasswordError extends Error {
  constructor() {
    super("El enlace de recuperación no es válido o expiró.");
    this.name = "ResetPasswordError";
  }
}

export async function resetPassword(input: z.input<typeof ResetPasswordSchema>) {
  const data = ResetPasswordSchema.parse(input);
  const tokenHash = hashToken(data.token);
  const resetToken = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { passwordHash: true, status: true, deletedAt: true } } },
  });
  if (
    !resetToken ||
    resetToken.usedAt ||
    resetToken.expiresAt.getTime() <= Date.now() ||
    resetToken.user.status !== "ACTIVO" ||
    resetToken.user.deletedAt
  )
    throw new ResetPasswordError();

  const passwordHash = await hashPassword(data.newPassword);
  await db.$transaction(async (tx) => {
    // Lock/CAS user first, serializing even two DIFFERENT links for one account.
    // Comparing the prior hash also rejects a token read before another reset won.
    const changed = await tx.user.updateMany({
      where: {
        id: resetToken.userId,
        status: "ACTIVO",
        deletedAt: null,
        passwordHash: resetToken.user.passwordHash,
      },
      data: { passwordHash, recoveryCodeUsedAt: new Date() },
    });
    if (changed.count !== 1) throw new ResetPasswordError();
    const now = new Date();
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: resetToken.id, tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    // Failed compare-and-swap rolls back the password change as well.
    if (consumed.count !== 1) throw new ResetPasswordError();
    await tx.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.session.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: now },
    });
  });
  return {
    message: "Contraseña actualizada correctamente. Inicia sesión con tu nueva contraseña.",
  };
}
