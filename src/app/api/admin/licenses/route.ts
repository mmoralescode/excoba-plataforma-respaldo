import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createLicense } from "@/server/use-cases/create-license";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { db } from "@/db/client";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole("SUPER_ADMIN", "SOPORTE");
    const body = await request.json();
    const result = await createLicense({ ...body, createdByAdminId: admin.id });

    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "LICENSE_CREATED",
        entity: "License",
        entityId: result.license.id,
      },
    });

    // El folio en texto plano se devuelve UNA sola vez, al administrador
    // que lo generó; después sólo existe su hash en base de datos.
    return NextResponse.json(
      { licenseId: result.license.id, folio: result.folio, status: result.license.status },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Datos inválidos.", details: error.flatten() }, { status: 400 });
    }
    console.error("Error creando licencia:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
