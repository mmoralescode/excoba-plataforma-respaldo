import { z } from "zod";
import { db } from "@/db/client";
import { hashPassword } from "@/lib/security/password";
import { generateRandomToken, hashToken } from "@/lib/security/tokens";
import { destroyAllSessions } from "@/lib/session";
import { sendPasswordResetEmail } from "@/lib/email/mailer";

const RESET_TOKEN_TTL_MS = 1000 * 60 * 30; // 30 minutos

export const RequestPasswordResetSchema = z.object({ email: z.string().email() });
export const ResetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(10, "La contraseña debe tener al menos 10 caracteres."),
});

/**
 * Genera un token de recuperación de un solo uso. Siempre responde de forma
 * genérica (sin revelar si el correo existe) — el envío real del correo
 * sólo ocurre si el usuario existe.
 */
export async function requestPasswordReset(input: z.infer<typeof RequestPasswordResetSchema>) {
  const parsed = RequestPasswordResetSchema.parse(input);
  const email = parsed.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });

  if (user) {
    const token = generateRandomToken();
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    await sendPasswordResetEmail(user.email, token);
  }

  return { message: "Si el correo existe, se envió un enlace de recuperación." };
}

export class ResetPasswordError extends Error {}

export async function resetPassword(input: z.infer<typeof ResetPasswordSchema>) {
  const data = ResetPasswordSchema.parse(input);
  const tokenHash = hashToken(data.token);

  const resetToken = await db.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new ResetPasswordError("El enlace de recuperación no es válido o expiró.");
  }

  const passwordHash = await hashPassword(data.newPassword);

  await db.$transaction([
    db.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    db.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  // Cambiar la contraseña invalida cualquier sesión activa por seguridad.
  await destroyAllSessions(resetToken.userId);

  return { message: "Contraseña actualizada correctamente." };
}
