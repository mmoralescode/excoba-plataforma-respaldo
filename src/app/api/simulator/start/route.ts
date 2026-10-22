import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { startSimulator, SimulatorStartError } from "@/server/use-cases/start-simulator";
import { requireUser, UnauthorizedError } from "@/lib/authorization";
import { CareerAccessError, getLicenseAccess } from "@/lib/license-career-access";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const result = await startSimulator({ ...body, userId: user.id }, getLicenseAccess(user));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CareerAccessError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }
    if (error instanceof SimulatorStartError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Error iniciando simulador:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
