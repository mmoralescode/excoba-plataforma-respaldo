import { z } from "zod";
import { db } from "@/db/client";
import { recalculateTopicPriority } from "@/server/use-cases/study-priority";

export const SubmitAttemptSchema = z.object({
  attemptId: z.string().min(1),
  userId: z.string().min(1),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedAnswerId: z.string().min(1).nullable(),
        flaggedForReview: z.boolean().default(false),
        responseTimeSeconds: z.number().int().min(0).optional(),
      }),
    )
    .min(1),
});

export class SubmitAttemptError extends Error {}

/**
 * Califica un intento comparando las respuestas seleccionadas contra
 * `answers.isCorrect` EN EL SERVIDOR (nunca se confía en un `isCorrect`
 * enviado por el cliente). Actualiza `progress` por tema con las reglas
 * usadas por el algoritmo de recomendación (ver `calculate-priority.ts`).
 */
export async function submitAttempt(input: z.infer<typeof SubmitAttemptSchema>) {
  const data = SubmitAttemptSchema.parse(input);

  const attempt = await db.attempt.findUnique({ where: { id: data.attemptId } });
  if (!attempt || attempt.userId !== data.userId) {
    throw new SubmitAttemptError("Intento no encontrado o no pertenece al usuario.");
  }
  if (attempt.status !== "EN_CURSO") {
    throw new SubmitAttemptError("Este intento ya fue entregado.");
  }

  const questionIds = data.answers.map((a) => a.questionId);
  const questions = await db.question.findMany({
    where: { id: { in: questionIds } },
    include: { answers: true },
  });
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  let correctCount = 0;
  const attemptAnswersData = data.answers.map((a) => {
    const question = questionsById.get(a.questionId);
    const correctAnswer = question?.answers.find((ans) => ans.isCorrect);
    const isCorrect = !!a.selectedAnswerId && a.selectedAnswerId === correctAnswer?.id;
    if (isCorrect) correctCount += 1;

    return {
      attemptId: data.attemptId,
      questionId: a.questionId,
      selectedAnswerId: a.selectedAnswerId,
      isCorrect,
      flaggedForReview: a.flaggedForReview,
      responseTimeSeconds: a.responseTimeSeconds,
      answeredAt: new Date(),
    };
  });

  const score = (correctCount / data.answers.length) * 100;

  await db.$transaction(async (tx) => {
    // En el simulador, las respuestas ya se fueron guardando con autosave
    // (ver `saveSimulatorAnswer`); aquí se actualizan en vez de duplicarlas.
    for (const answerData of attemptAnswersData) {
      await tx.attemptAnswer.upsert({
        where: {
          attemptId_questionId: { attemptId: answerData.attemptId, questionId: answerData.questionId },
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
      const bySubject = new Map<string, { correct: number; total: number }>();
      for (const a of attemptAnswersData) {
        const subjectId = questionsById.get(a.questionId)?.subjectId;
        if (!subjectId) continue;
        const bucket = bySubject.get(subjectId) ?? { correct: 0, total: 0 };
        bucket.total += 1;
        if (a.isCorrect) bucket.correct += 1;
        bySubject.set(subjectId, bucket);
      }
      for (const [subjectId, bucket] of bySubject) {
        await tx.examResult.create({
          data: {
            attemptId: data.attemptId,
            subjectId,
            score: (bucket.correct / bucket.total) * 100,
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
  });

  // Recalcular prioridad fuera de la transacción principal: no debe
  // bloquear la entrega del intento si falla o tarda.
  const topicIds = [...new Set(questions.map((q) => q.topicId))];
  await Promise.all(topicIds.map((topicId) => recalculateTopicPriority(data.userId, topicId)));

  return { attemptId: data.attemptId, score, correctCount, totalCount: data.answers.length };
}
