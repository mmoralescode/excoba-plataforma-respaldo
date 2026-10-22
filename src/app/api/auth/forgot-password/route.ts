import { NextRequest, NextResponse } from "next/server";
import { requestPasswordReset } from "@/server/use-cases/password-reset";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rate = checkRateLimit(
    `password-reset:${ip}`,
    RATE_LIMITS.passwordReset.limit,
    RATE_LIMITS.passwordReset.windowMs,
  );
  if (!rate.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const result = await requestPasswordReset(body);
    return NextResponse.json(result);
  } catch {
    // Respuesta genérica también ante error de validación, para no filtrar
    // información sobre correos existentes.
    return NextResponse.json({
      message: "Si el correo existe, se envió un enlace de recuperación.",
    });
  }
}
