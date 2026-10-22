import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  saveSimulatorAnswer,
  getSimulatorState,
  SimulatorStateError,
} from "@/server/use-cases/simulator-state";
import { requireUser, UnauthorizedError } from "@/lib/authorization";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const result = await saveSimulatorAnswer({ ...body, userId: user.id });
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
      return NextResponse.json({ error: "attemptId requerido." }, { status: 400 });
    }
    const state = await getSimulatorState(attemptId, user.id);
    return NextResponse.json(state);
  } catch (error) {
    return handleSimulatorError(error);
  }
}

function handleSimulatorError(error: unknown) {
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
