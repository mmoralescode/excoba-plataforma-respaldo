import { z } from "zod";
import { db } from "@/db/client";
import { Prisma } from "@prisma/client";
import {
  StructuredResponseSchema,
  hasStructuredMode,
  structuredPrompt,
} from "./structured-responses";
import { recoverAnswerMode } from "./simulator-formats";
import { getRemainingSeconds, parseSimulatorConfig } from "@/server/use-cases/simulator-rules";
import { ALL_CAREER_ACCESS, type LicenseAccess, assertAttemptCareerAccess, assertQuestionAccess } from "@/lib/license-career-access";

export const SaveSimulatorAnswerSchema = z.object({
  attemptId: z.string().min(1),
  userId: z.string().min(1),
  questionId: z.string().min(1),
  selectedAnswerId: z.string().min(1).nullable(),
  response: StructuredResponseSchema.optional(),
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
export async function saveSimulatorAnswer(input: z.infer<typeof SaveSimulatorAnswerSchema>, access: LicenseAccess = ALL_CAREER_ACCESS) {
  const data = SaveSimulatorAnswerSchema.parse(input);

  const attempt = await getActiveSimulatorAttempt(data.attemptId, data.userId);
  assertAttemptCareerAccess(access, attempt.config);
  const config = parseSimulatorConfig(attempt.config);
  const structured = hasStructuredMode(attempt.config, data.questionId);
  if ((structured && data.selectedAnswerId) || (!structured && data.response))
    throw new SimulatorStateError("Formato de respuesta no válido.");
  if (!config || !config.questionIds.includes(data.questionId)) {
    throw new SimulatorStateError("La pregunta no pertenece a este simulador.");
  }

  const question = await db.question.findUnique({
    where: { id: data.questionId },
    select: { topicId: true, subjectId: true, answers: { select: { id: true } } },
  });
  if (
    !question ||
    (data.selectedAnswerId && !question.answers.some((a) => a.id === data.selectedAnswerId))
  ) {
    throw new SimulatorStateError("La respuesta seleccionada no es válida.");
  }
  assertQuestionAccess(access, [question]);

  await db.$transaction(async (tx) => {
    // Lock the attempt and check the deadline again before saving. A late save
    // must not overwrite an answer already graded by another request.
    await tx.$queryRaw`SELECT "id" FROM "Attempt" WHERE "id" = ${data.attemptId} FOR UPDATE`;
    const active = await tx.attempt.findUnique({ where: { id: data.attemptId } });
    if (
      !active ||
      active.userId !== data.userId ||
      active.status !== "EN_CURSO" ||
      getRemainingSecondsForAttempt(active) <= 0
    )
      throw new SimulatorStateError("El simulador terminó; no se guardaron cambios tardíos.");
    await tx.attemptAnswer.upsert({
      where: { attemptId_questionId: { attemptId: data.attemptId, questionId: data.questionId } },
      create: {
        attemptId: data.attemptId,
        questionId: data.questionId,
        selectedAnswerId: data.selectedAnswerId,
        response: data.response ?? Prisma.DbNull,
        flaggedForReview: data.flaggedForReview,
        answeredAt: new Date(),
      },
      update: {
        response: data.response ?? Prisma.DbNull,
        selectedAnswerId: data.selectedAnswerId,
        flaggedForReview: data.flaggedForReview,
        answeredAt: new Date(),
      },
    });
  });

  return { ok: true, remainingSeconds: getRemainingSecondsForAttempt(attempt) };
}

/** Recupera el estado completo del intento (para reconexión tras desconexión). */
export async function getSimulatorState(attemptId: string, userId: string, access: LicenseAccess = ALL_CAREER_ACCESS) {
  const attempt = await getActiveSimulatorAttempt(attemptId, userId, true);
  assertAttemptCareerAccess(access, attempt.config);
  const config = parseSimulatorConfig(attempt.config);
  if (!config) throw new SimulatorStateError("La configuración del simulador no es válida.");

  const savedAnswers = await db.attemptAnswer.findMany({
    where: { attemptId },
    select: { questionId: true, selectedAnswerId: true, response: true, flaggedForReview: true },
  });
  const questions = await db.question.findMany({
    where: { id: { in: config.questionIds } },
    select: {
      id: true,
      text: true,
      subjectId: true,
      topicId: true,
      answers: { select: { id: true, text: true } },
    },
  });
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  assertQuestionAccess(access, questions);

  return {
    attemptId: attempt.id,
    status: attempt.status,
    remainingSeconds: getRemainingSeconds(attempt.startedAt, config),
    questions: config.questionIds.flatMap((questionId) => {
      const question = questionsById.get(questionId);
      return question
        ? [
            {
              ...question,
              answerMode: recoverAnswerMode(attempt.config, question),
              interaction: hasStructuredMode(attempt.config, questionId)
                ? structuredPrompt(questionId)
                : undefined,
              answers: hasStructuredMode(attempt.config, questionId) ? [] : question.answers,
            },
          ]
        : [];
    }),
    savedAnswers,
  };
}

export async function getLatestSimulatorState(userId: string, access: LicenseAccess = ALL_CAREER_ACCESS) {
  const attempt = await db.attempt.findFirst({
    where: { userId, type: "SIMULADOR", status: "EN_CURSO" },
    orderBy: { startedAt: "desc" },
  });
  return attempt ? getSimulatorState(attempt.id, userId, access) : null;
}

async function getActiveSimulatorAttempt(attemptId: string, userId: string, allowDeadline = false) {
  const attempt = await db.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.userId !== userId || attempt.type !== "SIMULADOR") {
    throw new SimulatorStateError("Simulador no encontrado.");
  }

  // El estado puede leerse al vencer para recuperar y entregar lo guardado.
  // Las escrituras se rechazan; submitAttempt ignora elecciones tardías.
  if (
    !allowDeadline &&
    attempt.status === "EN_CURSO" &&
    getRemainingSecondsForAttempt(attempt) <= 0
  ) {
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
function getRemainingSecondsForAttempt(attempt: { startedAt: Date; config: unknown }): number {
  const config = parseSimulatorConfig(attempt.config);
  return config ? getRemainingSeconds(attempt.startedAt, config) : 0;
}
