import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { resetPassword, ResetPasswordError } from "@/server/use-cases/password-reset";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await resetPassword(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }
    if (error instanceof ResetPasswordError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error en reset de contraseña:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
