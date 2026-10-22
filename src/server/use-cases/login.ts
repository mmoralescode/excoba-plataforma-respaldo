import { z } from "zod";
import { db } from "@/db/client";
import { verifyPassword } from "@/lib/security/password";
import { createSession, SessionAuthenticationError } from "@/lib/session";
import { canAccessPlatform } from "@/lib/license-access";

export const LoginInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

export class LoginError extends Error {}

export async function login(input: LoginInput, userAgent?: string) {
  const parsed = LoginInputSchema.parse(input);
  // Normaliza el correo (espacios y mayúsculas no deben importar): sin
  // esto, "Admin@excoba.local" no encontraría a "admin@excoba.local".
  const data = { ...parsed, email: parsed.email.trim().toLowerCase() };

  const user = await db.user.findUnique({
    where: { email: data.email },
    include: { roles: { include: { role: true } }, license: true },
  });

  // Se ejecuta verifyPassword incluso si el usuario no existe, contra un
  // hash ficticio, para que el tiempo de respuesta no revele si el correo
  // está registrado (mitigación de enumeración de usuarios / timing attack).
  const DUMMY_HASH =
    "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const passwordValid = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, data.password);

  if (!user || !passwordValid) {
    throw new LoginError("Correo o contraseña incorrectos.");
  }

  if (!canAccessPlatform(user)) {
    throw new LoginError("Tu acceso no está activo. Contacta al administrador de la plataforma.");
  }

  try {
    const session = await createSession(user.id, user.passwordHash, userAgent);
    return { user, session };
  } catch (error) {
    if (error instanceof SessionAuthenticationError) {
      throw new LoginError("Correo o contraseña incorrectos.");
    }
    throw error;
  }
}
