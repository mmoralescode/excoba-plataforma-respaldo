import { z } from "zod";
import { db } from "@/db/client";

export const StartSimulatorSchema = z.object({
  userId: z.string().min(1),
  questionCount: z.number().int().min(5).max(200).default(40),
  timeLimitSeconds: z.number().int().min(60).max(4 * 60 * 60).default(60 * 60),
  subjectIds: z.array(z.string().min(1)).optional(),
});

export async function startSimulator(input: z.infer<typeof StartSimulatorSchema>) {
  const data = StartSimulatorSchema.parse(input);

  const candidates = await db.question.findMany({
    where: {
      status: "PUBLICADO",
      deletedAt: null,
      subjectId: data.subjectIds ? { in: data.subjectIds } : undefined,
    },
    select: {
      id: true,
      text: true,
      difficulty: true,
      subjectId: true,
      answers: { select: { id: true, text: true } },
    },
  });

  const selected = shuffle(candidates).slice(0, data.questionCount);

  const attempt = await db.attempt.create({
    data: {
      userId: data.userId,
      type: "SIMULADOR",
      config: { timeLimitSeconds: data.timeLimitSeconds, questionIds: selected.map((q) => q.id) },
    },
  });

  return {
    attemptId: attempt.id,
    startedAt: attempt.startedAt,
    timeLimitSeconds: data.timeLimitSeconds,
    questions: selected.map((q) => ({ ...q, answers: shuffle(q.answers) })),
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
