import { z } from "zod";
import { db } from "@/db/client";
import {
  ALL_CAREER_ACCESS, type LicenseAccess, assertCareerAccess, allowedCareerTopicIds,
  allowedCareerSubjectIds, CareerAccessError,
} from "@/lib/license-career-access";
import { fullExamSubjects, selectFullExam } from "./simulator-blueprint";
import { structuredPrompt } from "./structured-responses";
import {
  assignAnswerModes,
  selectMixedQuestions,
  usedSimulatorQuestionIds,
} from "./simulator-formats";
import {
  SIMULATOR_QUESTION_COUNT,
  SIMULATOR_TIME_LIMIT_SECONDS,
} from "@/content/simulator-settings";

export class SimulatorStartError extends Error {}

export const StartSimulatorSchema = z.object({
  mode: z.enum(["short", "full"]).optional(),
  careerId: z.string().optional(),
  userId: z.string().min(1),
  questionCount: z.number().int().min(5).max(200).default(SIMULATOR_QUESTION_COUNT),
  timeLimitSeconds: z
    .number()
    .int()
    .min(60)
    .max(4 * 60 * 60)
    .default(SIMULATOR_TIME_LIMIT_SECONDS),
  subjectIds: z.array(z.string().min(1)).optional(),
});

export async function startSimulator(input: z.infer<typeof StartSimulatorSchema>, access: LicenseAccess = ALL_CAREER_ACCESS) {
  const data = StartSimulatorSchema.parse(input);
  assertCareerAccess(access, data.careerId);
  const allowedSubjects = allowedCareerSubjectIds(access);
  const allowedTopics = allowedCareerTopicIds(access);
  if (allowedSubjects !== null) {
    if (data.subjectIds?.some((id) => !allowedSubjects.includes(id)))
      throw new CareerAccessError("Una asignatura no pertenece a tu carrera.");
    data.careerId = access.selectedCareerId!;
    data.subjectIds = data.subjectIds ?? allowedSubjects;
  }
  let fullSubjects: string[] | undefined;
  if (data.mode === "full") {
    try {
      fullSubjects = fullExamSubjects(data.careerId);
    } catch (error) {
      throw new SimulatorStartError((error as Error).message);
    }
    data.questionCount = 180;
    data.timeLimitSeconds = 180 * 60;
  }

  // Serializa la asignación por alumno: dos pestañas no pueden reservar el mismo reactivo.
  return db.$transaction(
    async (tx) => {
      const user = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "User" WHERE "id" = ${data.userId} FOR UPDATE`;
      if (!user.length) throw new SimulatorStartError("Usuario no encontrado.");
      const history = await tx.attempt.findMany({
        where: { userId: data.userId, type: "SIMULADOR" },
        select: { config: true, answers: { select: { questionId: true } } },
      });
      const usedIds = usedSimulatorQuestionIds(history);

      const candidates = await tx.question.findMany({
        where: {
          id: { notIn: usedIds },
          status: "PUBLICADO",
          deletedAt: null,
          ...(allowedTopics !== null ? { topicId: { in: allowedTopics } } : {}),
          answers: { some: {} },
          subjectId: fullSubjects
            ? { in: fullSubjects }
            : data.subjectIds
              ? { in: data.subjectIds }
              : undefined,
        },
        select: {
          id: true,
          text: true,
          difficulty: true,
          subjectId: true,
          topicId: true,
          answers: { select: { id: true, text: true } },
        },
      });

      let selected: typeof candidates;
      try {
        const mixed = shuffle(candidates);
        // Include available interaction types, but never bypass history or subject quotas.
        const formats = new Set<string>();
        const reserved = mixed
          .filter((q) => {
            const kind = structuredPrompt(q.id)?.kind;
            if (!kind || formats.has(kind)) return false;
            formats.add(kind);
            return true;
          })
          .slice(0, Math.floor(data.questionCount / 2));
        const reservedIds = new Set(reserved.map((q) => q.id));
        const orderedCandidates = [...reserved, ...mixed.filter((q) => !reservedIds.has(q.id))];
        selected = fullSubjects
          ? selectFullExam(orderedCandidates, fullSubjects)
          : [
              ...reserved,
              ...selectMixedQuestions(
                mixed.filter((q) => !reservedIds.has(q.id)),
                data.questionCount - reserved.length,
              ),
            ];
      } catch (error) {
        throw new SimulatorStartError((error as Error).message);
      }
      if (selected.length < data.questionCount) {
        throw new SimulatorStartError(
          `Quedan ${candidates.length} preguntas nuevas disponibles para esta selección. Se necesitan ${data.questionCount} para otro simulador sin repetir. Hace falta ampliar el banco; puedes continuar en Práctica.`,
        );
      }

      const answerModes = assignAnswerModes(selected);
      for (const q of selected) if (structuredPrompt(q.id)) answerModes[q.id] = "STRUCTURED";
      const ordered = shuffle(selected);
      const attempt = await tx.attempt.create({
        data: {
          userId: data.userId,
          type: "SIMULADOR",
          config: {
            mode: data.mode ?? "short",
            careerId: data.careerId ?? null,
            timeLimitSeconds: data.timeLimitSeconds,
            questionIds: ordered.map((q) => q.id),
            answerModes,
          },
        },
      });

      return {
        attemptId: attempt.id,
        startedAt: attempt.startedAt,
        timeLimitSeconds: data.timeLimitSeconds,
        questions: ordered.map((q) => ({
          ...q,
          answerMode: answerModes[q.id],
          interaction: structuredPrompt(q.id),
          answers: answerModes[q.id] === "STRUCTURED" ? [] : shuffle(q.answers),
        })),
      };
    },
    { timeout: 30_000, isolationLevel: "ReadCommitted" },
  );
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
