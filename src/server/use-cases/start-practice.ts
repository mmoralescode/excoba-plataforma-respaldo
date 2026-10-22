import { z } from "zod";
import { db } from "@/db/client";
import {
  ALL_CAREER_ACCESS, type LicenseAccess, assertCareerAccess, allowedCareerTopicIds,
  allowedCareerSubjectIds, CareerAccessError,
} from "@/lib/license-career-access";
import {
  careerTopicIds,
  getCareer,
  officialTopicIds,
  selectPracticeQuestions,
} from "@/content/study-plan";

export const StartPracticeSchema = z.object({
  userId: z.string().min(1),
  careerId: z.string().refine((id) => !!getCareer(id), "Selecciona una carrera del Anexo I."),
  subjectId: z.string().min(1).optional(),
  topicId: z.string().min(1).optional(),
  scope: z.enum(["career", "official", "extra", "all"]).default("career"),
  difficulty: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),
  questionCount: z.number().int().min(1).max(50).default(10),
});

export async function startPractice(input: z.input<typeof StartPracticeSchema>, access: LicenseAccess = ALL_CAREER_ACCESS) {
  const data = StartPracticeSchema.parse(input);
  assertCareerAccess(access, data.careerId);
  const allowedTopics = allowedCareerTopicIds(access);
  const allowedSubjects = allowedCareerSubjectIds(access);
  if (allowedTopics !== null) {
    if ((data.scope !== "career" && data.scope !== "official") ||
      (data.topicId && !allowedTopics.includes(data.topicId)) ||
      (data.subjectId && !allowedSubjects!.includes(data.subjectId)))
      throw new CareerAccessError("Tu plan solo permite practicar el temario de tu carrera.");
    // Existing study links use "official". For this plan that means only the
    // official topics included in the confirmed career, never the whole bank.
    data.scope = "career";
  }
  const career = getCareer(data.careerId)!;
  const [candidates, answered] = await Promise.all([
    db.question.findMany({
      where: {
        status: "PUBLICADO",
        deletedAt: null,
        subjectId: data.subjectId ?? (allowedSubjects !== null ? { in: allowedSubjects } : undefined),
        difficulty: data.difficulty,
        AND: [
          data.topicId ? { topicId: data.topicId } : {},
          data.scope === "career"
            ? { topicId: { in: careerTopicIds(career) } }
            : data.scope === "official"
              ? { topicId: { in: officialTopicIds } }
              : data.scope === "extra"
                ? { topicId: { notIn: officialTopicIds } }
                : {},
          allowedTopics !== null ? { topicId: { in: allowedTopics } } : {},
        ],
      },
      select: {
        id: true,
        topicId: true,
        text: true,
        difficulty: true,
        estimatedTimeSeconds: true,
        answers: { select: { id: true, text: true, order: true } },
      },
    }),
    db.attemptAnswer.findMany({
      where: {
        attempt: { userId: data.userId, status: "ENTREGADO" },
        selectedAnswerId: { not: null },
      },
      distinct: ["questionId"],
      select: { questionId: true },
    }),
  ]);
  const selected = selectPracticeQuestions(
    shuffle(candidates),
    career,
    new Set(answered.map((a) => a.questionId)),
    data.questionCount,
  );
  if (!selected.length) return { attemptId: null, questions: [] };
  const attempt = await db.attempt.create({
    data: {
      userId: data.userId,
      type: "PRACTICA",
      config: {
        careerId: career.id,
        subjectId: data.subjectId ?? null,
        topicId: data.topicId ?? null,
        scope: data.scope,
        difficulty: data.difficulty ?? null,
        questionIds: selected.map((q) => q.id),
      },
    },
  });
  return {
    attemptId: attempt.id,
    questions: selected.map(({ topicId: _topicId, ...q }) => ({
      ...q,
      answers: shuffle(q.answers),
    })),
  };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
