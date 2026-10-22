import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { submitAttempt, SubmitAttemptError } from "@/server/use-cases/submit-attempt";
import { requireUser, UnauthorizedError } from "@/lib/authorization";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const result = await submitAttempt({ ...body, userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }
    if (error instanceof SubmitAttemptError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error entregando práctica:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
