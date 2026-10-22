import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { login, LoginError } from "@/server/use-cases/login";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const body = await request.json();
  const rateKey = `login:${ip}:${String(body?.email ?? "")}`;
  const rate = checkRateLimit(rateKey, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);

  if (!rate.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 });
  }

  try {
    const { user } = await login(body, request.headers.get("user-agent") ?? undefined);
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    if (error instanceof ZodError || error instanceof LoginError) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
    }
    console.error("Error en login:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
