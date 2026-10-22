import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  saveSimulatorAnswer,
  getSimulatorState,
  getLatestSimulatorState,
  SimulatorStateError,
} from "@/server/use-cases/simulator-state";
import { requireUser, UnauthorizedError } from "@/lib/authorization";
import { CareerAccessError, getLicenseAccess } from "@/lib/license-career-access";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const result = await saveSimulatorAnswer({ ...body, userId: user.id }, getLicenseAccess(user));
    return NextResponse.json(result);
  } catch (error) {
    return handleSimulatorError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const attemptId = request.nextUrl.searchParams.get("attemptId");
    if (!attemptId) {
      const state = await getLatestSimulatorState(user.id, getLicenseAccess(user));
      return NextResponse.json(state ?? { attempt: null });
    }
    const state = await getSimulatorState(attemptId, user.id, getLicenseAccess(user));
    return NextResponse.json(state);
  } catch (error) {
    return handleSimulatorError(error);
  }
}

function handleSimulatorError(error: unknown) {
  if (error instanceof CareerAccessError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  if (error instanceof SimulatorStateError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Error en simulador:", error);
  return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
}
