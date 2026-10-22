import { Prisma } from "@prisma/client";
import { db } from "@/db/client";

/**
 * Registra una acción sensible en `audit_logs`. Se usa desde los casos de
 * uso/endpoints que ya invocan `requireRole`/`requireUser`, para no repetir
 * la construcción del objeto en cada endpoint (ver Módulo 1, sección 11).
 */
export async function logAudit(params: {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      // El campo Json de Prisma exige su propio tipo (Prisma.InputJsonValue),
      // más estricto que Record<string, unknown>; se castea aquí en el único
      // punto de entrada a la base de datos, y se usa Prisma.JsonNull cuando
      // no se pasa metadata (Prisma no acepta `undefined` para columnas Json).
      metadata:
        params.metadata !== undefined
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
    },
  });
}
