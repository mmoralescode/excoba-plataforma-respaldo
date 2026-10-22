import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { requireUser, UnauthorizedError } from "@/lib/authorization";

export async function GET() {
  try {
    await requireUser();
    const subjects = await db.subject.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true, origin: true },
    });
    return NextResponse.json({ subjects });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    console.error("Error listando materias:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
