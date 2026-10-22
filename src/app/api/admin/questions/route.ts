import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { upsertQuestion } from "@/server/use-cases/academic-content";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { db } from "@/db/client";

export async function POST(request: NextRequest) {
  try {
    const editor = await requireRole("SUPER_ADMIN", "EDITOR_ACADEMICO");
    const body = await request.json();
    const question = await upsertQuestion({ ...body, authorId: editor.id });

    await db.auditLog.create({
      data: {
        actorId: editor.id,
        action: body.id ? "QUESTION_UPDATED" : "QUESTION_CREATED",
        entity: "Question",
        entityId: question.id,
      },
    });

    return NextResponse.json({ id: question.id, status: question.status }, { status: 201 });
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
    console.error("Error guardando pregunta:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
