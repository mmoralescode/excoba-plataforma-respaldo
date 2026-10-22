import { z } from "zod";
import { db } from "@/db/client";

export const StartPracticeSchema = z.object({
  userId: z.string().min(1),
  subjectId: z.string().min(1).optional(),
  topicId: z.string().min(1).optional(),
  difficulty: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),
  questionCount: z.number().int().min(1).max(50).default(10),
});

/**
 * Crea un intento de práctica y selecciona preguntas publicadas al azar
 * según los filtros indicados. La respuesta devuelta al cliente NUNCA
 * incluye `isCorrect` (ver regla crítica de seguridad, Módulo 1 sección 8).
 */
export async function startPractice(input: z.infer<typeof StartPracticeSchema>) {
  const data = StartPracticeSchema.parse(input);

  const candidateQuestions = await db.question.findMany({
    where: {
      status: "PUBLICADO",
      deletedAt: null,
      subjectId: data.subjectId,
      topicId: data.topicId,
      difficulty: data.difficulty,
    },
    select: {
      id: true,
      text: true,
      difficulty: true,
      estimatedTimeSeconds: true,
      answers: { select: { id: true, text: true, order: true } },
    },
  });

  const selected = shuffle(candidateQuestions).slice(0, data.questionCount);

  const attempt = await db.attempt.create({
    data: {
      userId: data.userId,
      type: "PRACTICA",
      config: {
        subjectId: data.subjectId ?? null,
        topicId: data.topicId ?? null,
        difficulty: data.difficulty ?? null,
      },
    },
  });

  return {
    attemptId: attempt.id,
    questions: selected.map((q) => ({
      ...q,
      answers: shuffle(q.answers),
    })),
  };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = temp;
  }
  return copy;
}
