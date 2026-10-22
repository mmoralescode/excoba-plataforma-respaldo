import { cookies } from "next/headers";
import { db } from "@/db/client";
import { generateRandomToken, hashToken } from "@/lib/security/tokens";
import { canAccessPlatform } from "@/lib/license-access";

export const SESSION_COOKIE_NAME = "excoba_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

export class SessionAuthenticationError extends Error {
  constructor() {
    super("No se pudo autenticar la sesión.");
    this.name = "SessionAuthenticationError";
  }
}

/**
 * Crea una nueva sesión para el usuario y revoca cualquier sesión activa
 * previa, garantizando una única sesión activa por usuario (ver Módulo 1,
 * sección 12 / flujo de sesión única).
 */
export async function createSession(
  userId: string,
  expectedPasswordHash: string,
  userAgent?: string,
) {
  if (!expectedPasswordHash) throw new SessionAuthenticationError();
  const token = generateRandomToken();
  const session = await db.$transaction(async (tx) => {
    // Reset also locks User first. A login verified against a superseded hash
    // cannot create a session after reset; concurrent logins serialize here too.
    const matching = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "id" = ${userId} AND "passwordHash" = ${expectedPasswordHash}
        AND "status" = 'ACTIVO' AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (!matching.length) throw new SessionAuthenticationError();
    const freshUser = await tx.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } }, license: true },
    });
    const now = new Date();
    if (!freshUser || !canAccessPlatform(freshUser, now)) {
      throw new SessionAuthenticationError();
    }
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return tx.session.create({
      data: {
        userId,
        sessionTokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
        userAgent: userAgent?.slice(0, 255),
      },
    });
  });

  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });

  return session;
}

/**
 * Recupera el usuario autenticado a partir de la cookie de sesión. Devuelve
 * `null` si no hay sesión, si expiró, si fue revocada (por ejemplo, por un
 * login en otro dispositivo) o si la licencia del usuario ya no está activa.
 */
export async function getSessionUser() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { sessionTokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
          license: true,
        },
      },
    },
  });

  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt <= now) {
    return null;
  }

  if (!canAccessPlatform(session.user, now)) {
    return null;
  }

  return session.user;
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await db.session.updateMany({
      where: { sessionTokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
  }
  cookies().delete(SESSION_COOKIE_NAME);
}

/** Cierra todas las sesiones activas del usuario (usado desde su perfil). */
export async function destroyAllSessions(userId: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
