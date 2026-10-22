import { PrismaClient } from "@prisma/client";

/**
 * Cliente singleton de Prisma.
 *
 * En desarrollo, Next.js recarga módulos en cada cambio de archivo; sin este
 * patrón se crearía una nueva instancia de PrismaClient (y una nueva pool de
 * conexiones) en cada recarga, agotando las conexiones disponibles de
 * PostgreSQL.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const db =
  global.__prisma ??
  new PrismaClient({
    // Production handlers report redacted error codes; Prisma exception text
    // may contain account data or connection details and must not be printed.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : [],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = db;
}
