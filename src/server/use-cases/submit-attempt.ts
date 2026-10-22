import { z } from "zod";
import { db } from "@/db/client";
import { getAttemptReview } from "./attempt-review";
import { Prisma } from "@prisma/client";
import { ALL_CAREER_ACCESS, type LicenseAccess, assertAttemptCareerAccess, assertQuestionAccess } from "@/lib/license-career-access";
import {
  StructuredResponseSchema,
  gradeStructured,
  hasStructuredMode,
} from "./structured-responses";
import { recalculateTopicPriority } from "@/server/use-cases/study-priority";
import {
  hasSameQuestionSet,
  getRemainingSeconds,
  parseSimulatorConfig,
} from "@/server/use-cases/simulator-rules";

export const SubmitAttemptSchema = z.object({
  attemptId: z.string().min(1),
  userId: z.string().min(1),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedAnswerId: z.string().min(1).nullable(),
        response: StructuredResponseSchema.optional(),
        flaggedForReview: z.boolean().default(false),
        responseTimeSeconds: z.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .max(200),
  expectedType: z.enum(["PRACTICA", "SIMULADOR"]).optional(),
});

export class SubmitAttemptError extends Error {}

/**
 * Califica un intento comparando las respuestas seleccionadas contra
 * `answers.isCorrect` EN EL SERVIDOR (nunca se confía en un `isCorrect`
 * enviado por el cliente). Actualiza `progress` por tema con las reglas
 * usadas por el algoritmo de recomendación (ver `calculate-priority.ts`).
 */
export async function submitAttempt(input: z.infer<typeof SubmitAttemptSchema>, access: LicenseAccess = ALL_CAREER_ACCESS) {
  const data = SubmitAttemptSchema.parse(input);

  const attempt = await db.attempt.findUnique({ where: { id: data.attemptId } });
  if (!attempt || attempt.userId !== data.userId) {
    throw new SubmitAttemptError("Intento no encontrado o no pertenece al usuario.");
  }
  assertAttemptCareerAccess(access, attempt.config);
  if (data.expectedType && attempt.type !== data.expectedType) {
    throw new SubmitAttemptError("El tipo de intento no coincide con este simulador.");
  }
  if (attempt.status !== "EN_CURSO") {
    throw new SubmitAttemptError("Este intento ya fue entregado.");
  }

  if (attempt.type === "SIMULADOR") {
    const config = parseSimulatorConfig(attempt.config);
    if (
      !config ||
      !hasSameQuestionSet(
        config.questionIds,
        data.answers.map((a) => a.questionId),
      )
    ) {
      throw new SubmitAttemptError("La entrega no coincide con las preguntas asignadas.");
    }
    if (getRemainingSeconds(attempt.startedAt, config) <= 0) {
      // Once time expires, ignore client answers: only already-saved work counts.
      const saved = await db.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
      data.answers = config.questionIds.map((questionId) => {
        const answer = saved.find((a) => a.questionId === questionId);
        return {
          questionId,
          selectedAnswerId: answer?.selectedAnswerId ?? null,
          response: answer?.response ? StructuredResponseSchema.parse(answer.response) : undefined,
          flaggedForReview: answer?.flaggedForReview ?? false,
        };
      });
    }
  } else if (new Set(data.answers.map((a) => a.questionId)).size !== data.answers.length) {
    throw new SubmitAttemptError("La entrega contiene preguntas repetidas.");
  }

  // New practice sessions persist their assigned question set. Older sessions
  // remain compatible; clients cannot substitute questions in new sessions.
  if (attempt.type === "PRACTICA") {
    const config = attempt.config as { questionIds?: unknown } | null;
    if (
      Array.isArray(config?.questionIds) &&
      !hasSameQuestionSet(
        config.questionIds as string[],
        data.answers.map((a) => a.questionId),
      )
    ) {
      throw new SubmitAttemptError("La entrega no coincide con las preguntas asignadas.");
    }
  }

  const questionIds = data.answers.map((a) => a.questionId);
  const questions = await db.question.findMany({
    where: { id: { in: questionIds } },
    include: { answers: true },
  });
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  assertQuestionAccess(access, questions);
  if (questions.length !== questionIds.length) {
    throw new SubmitAttemptError("Una o más preguntas ya no están disponibles.");
  }

  let correctCount = 0;
  let totalCredit = 0;
  const attemptAnswersData = data.answers.map((a) => {
    const question = questionsById.get(a.questionId);
    const correctAnswer = question?.answers.find((ans) => ans.isCorrect);
    if (a.selectedAnswerId && !question?.answers.some((ans) => ans.id === a.selectedAnswerId)) {
      throw new SubmitAttemptError("Una respuesta seleccionada no pertenece a su pregunta.");
    }
    const structured =
      attempt.type === "SIMULADOR" && hasStructuredMode(attempt.config, a.questionId);
    if ((structured && a.selectedAnswerId) || (!structured && a.response))
      throw new SubmitAttemptError("Formato de respuesta no válido.");
    const credit = structured
      ? gradeStructured(a.questionId, a.response)
      : a.selectedAnswerId && a.selectedAnswerId === correctAnswer?.id
        ? 1
        : 0;
    const isCorrect = credit === 1;
    totalCredit += credit;
    if (isCorrect) correctCount += 1;

    return {
      attemptId: data.attemptId,
      questionId: a.questionId,
      selectedAnswerId: a.selectedAnswerId,
      isCorrect,
      credit,
      response: a.response ?? Prisma.DbNull,
      flaggedForReview: a.flaggedForReview,
      responseTimeSeconds: a.responseTimeSeconds,
      answeredAt: new Date(),
    };
  });

  const score = (totalCredit / data.answers.length) * 100;

  await db.$transaction(
    async (tx) => {
      // Different attempts by the same student cannot overwrite each other's totals.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${data.userId} FOR UPDATE`;
      // Compare-and-set serializes double clicks/retries before progress is changed.
      const claimed = await tx.attempt.updateMany({
        where: { id: data.attemptId, userId: data.userId, status: "EN_CURSO" },
        data: { status: "ENTREGADO", finishedAt: new Date(), score },
      });
      if (claimed.count !== 1) throw new SubmitAttemptError("Este intento ya fue entregado.");
      // En el simulador, las respuestas ya se fueron guardando con autosave
      // (ver `saveSimulatorAnswer`); aquí se actualizan en vez de duplicarlas.
      for (const answerData of attemptAnswersData) {
        await tx.attemptAnswer.upsert({
          where: {
            attemptId_questionId: {
              attemptId: answerData.attemptId,
              questionId: answerData.questionId,
            },
          },
          create: answerData,
          update: answerData,
        });
      }

      await tx.attempt.update({
        where: { id: data.attemptId },
        data: { status: "ENTREGADO", finishedAt: new Date(), score },
      });

      if (attempt.type === "SIMULADOR") {
        const bySubject = new Map<string, { correct: number; total: number; credit: number }>();
        for (const a of attemptAnswersData) {
          const subjectId = questionsById.get(a.questionId)?.subjectId;
          if (!subjectId) continue;
          const bucket = bySubject.get(subjectId) ?? { correct: 0, total: 0, credit: 0 };
          bucket.credit += a.credit;
          bucket.total += 1;
          if (a.isCorrect) bucket.correct += 1;
          bySubject.set(subjectId, bucket);
        }
        for (const [subjectId, bucket] of bySubject) {
          await tx.examResult.create({
            data: {
              attemptId: data.attemptId,
              subjectId,
              score: (bucket.credit / bucket.total) * 100,
              correctCount: bucket.correct,
              totalCount: bucket.total,
            },
          });
        }
      }

      // Actualiza `progress` por tema con las preguntas de este intento.
      const topicIds = [...new Set(questions.map((q) => q.topicId))];
      for (const topicId of topicIds) {
        const topicAnswers = attemptAnswersData.filter(
          (a) => questionsById.get(a.questionId)?.topicId === topicId,
        );
        const topicCorrect = topicAnswers.filter((a) => a.isCorrect).length;
        const topicErrors = topicAnswers.length - topicCorrect;

        const existing = await tx.progress.findUnique({
          where: { userId_topicId: { userId: data.userId, topicId } },
        });

        const totalAttempts = (existing?.totalAttempts ?? 0) + topicAnswers.length;
        const totalErrors = (existing?.totalErrors ?? 0) + topicErrors;
        const totalCorrect = totalAttempts - totalErrors;
        const accuracyPct = totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : 0;

        await tx.progress.upsert({
          where: { userId_topicId: { userId: data.userId, topicId } },
          create: {
            userId: data.userId,
            topicId,
            accuracyPct,
            totalAttempts,
            totalErrors,
            lastPracticedAt: new Date(),
          },
          update: {
            accuracyPct,
            totalAttempts,
            totalErrors,
            lastPracticedAt: new Date(),
          },
        });
      }
    },
    { timeout: 60_000 },
  );

  // Recalcular prioridad fuera de la transacción principal: no debe
  // bloquear la entrega del intento si falla o tarda.
  const topicIds = [...new Set(questions.map((q) => q.topicId))];
  await Promise.allSettled(
    topicIds.map((topicId) => recalculateTopicPriority(data.userId, topicId)),
  );

  const review = await getAttemptReview(data.attemptId, data.userId, access);
  return {
    attemptId: data.attemptId,
    score,
    correctCount,
    totalCount: data.answers.length,
    review: review?.review ?? [],
  };
}
