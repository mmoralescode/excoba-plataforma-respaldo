import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { registerUser, RegisterError } from "@/server/use-cases/register-user";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rate = checkRateLimit(`register:${ip}`, RATE_LIMITS.register.limit, RATE_LIMITS.register.windowMs);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const user = await registerUser(body);
    return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Datos inválidos.", details: error.flatten() }, { status: 400 });
    }
    if (error instanceof RegisterError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error en registro:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
