import { z } from "zod";
import { db } from "@/db/client";

export const SaveSimulatorAnswerSchema = z.object({
  attemptId: z.string().min(1),
  userId: z.string().min(1),
  questionId: z.string().min(1),
  selectedAnswerId: z.string().min(1).nullable(),
  flaggedForReview: z.boolean().default(false),
});

export class SimulatorStateError extends Error {}

/**
 * Guarda (upsert) la respuesta de UNA pregunta durante el simulador, sin
 * calificar todavía (la calificación ocurre sólo en `submitAttempt`, al
 * entregar). Esto permite el autosave y la recuperación ante desconexión:
 * al reconectar, el cliente vuelve a pedir el estado del intento y recibe
 * exactamente lo que ya había guardado.
 */
export async function saveSimulatorAnswer(input: z.infer<typeof SaveSimulatorAnswerSchema>) {
  const data = SaveSimulatorAnswerSchema.parse(input);

  const attempt = await getActiveSimulatorAttempt(data.attemptId, data.userId);

  await db.attemptAnswer.upsert({
    where: { attemptId_questionId: { attemptId: data.attemptId, questionId: data.questionId } },
    create: {
      attemptId: data.attemptId,
      questionId: data.questionId,
      selectedAnswerId: data.selectedAnswerId,
      flaggedForReview: data.flaggedForReview,
      answeredAt: new Date(),
    },
    update: {
      selectedAnswerId: data.selectedAnswerId,
      flaggedForReview: data.flaggedForReview,
      answeredAt: new Date(),
    },
  });

  return { ok: true, remainingSeconds: getRemainingSeconds(attempt) };
}

/** Recupera el estado completo del intento (para reconexión tras desconexión). */
export async function getSimulatorState(attemptId: string, userId: string) {
  const attempt = await getActiveSimulatorAttempt(attemptId, userId);

  const savedAnswers = await db.attemptAnswer.findMany({
    where: { attemptId },
    select: { questionId: true, selectedAnswerId: true, flaggedForReview: true },
  });

  return {
    attemptId: attempt.id,
    status: attempt.status,
    remainingSeconds: getRemainingSeconds(attempt),
    savedAnswers,
  };
}

async function getActiveSimulatorAttempt(attemptId: string, userId: string) {
  const attempt = await db.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== userId || attempt.type !== "SIMULADOR") {
    throw new SimulatorStateError("Simulador no encontrado.");
  }

  // Auto-expiración: si el tiempo ya se agotó pero el estado sigue
  // EN_CURSO (el alumno nunca hizo el "submit" final), se marca EXPIRADO
  // en cuanto el servidor detecta la condición, en lugar de depender de un
  // job en segundo plano.
  if (attempt.status === "EN_CURSO" && getRemainingSeconds(attempt) <= 0) {
    await db.attempt.update({
      where: { id: attempt.id },
      data: { status: "EXPIRADO", finishedAt: new Date() },
    });
    throw new SimulatorStateError("El tiempo del simulador se agotó.");
  }

  if (attempt.status !== "EN_CURSO") {
    throw new SimulatorStateError("Este simulador ya fue entregado o expiró.");
  }
  return attempt;
}

/**
 * El tiempo restante SIEMPRE se calcula en el servidor contra
 * `startedAt` + `timeLimitSeconds` de la configuración guardada al iniciar
 * el intento — nunca se confía en un reloj del cliente (ver Módulo 1,
 * sección 14).
 */
function getRemainingSeconds(attempt: { startedAt: Date; config: unknown }): number {
  const config = attempt.config as { timeLimitSeconds?: number } | null;
  const timeLimitSeconds = config?.timeLimitSeconds ?? 0;
  const elapsedSeconds = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);
  return Math.max(0, timeLimitSeconds - elapsedSeconds);
}
