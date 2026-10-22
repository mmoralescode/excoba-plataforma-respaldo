import { z } from "zod";
import { db } from "@/db/client";

// ---------------------------------------------------------------------------
// Materias y temas
// ---------------------------------------------------------------------------

export const CreateSubjectSchema = z.object({
  areaId: z.string().min(1),
  name: z.string().min(2).max(120),
  order: z.number().int().min(0),
  origin: z.enum(["OFICIAL", "PROPIO"]).default("OFICIAL"),
});

export async function createSubject(input: z.infer<typeof CreateSubjectSchema>) {
  const data = CreateSubjectSchema.parse(input);
  return db.subject.create({ data });
}

export const CreateTopicSchema = z.object({
  subjectId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  name: z.string().min(2).max(160),
  order: z.number().int().min(0),
});

export async function createTopic(input: z.infer<typeof CreateTopicSchema>) {
  const data = CreateTopicSchema.parse(input);
  return db.topic.create({ data });
}

// ---------------------------------------------------------------------------
// Lecciones
// ---------------------------------------------------------------------------

export const UpsertLessonSchema = z.object({
  id: z.string().min(1).optional(),
  topicId: z.string().min(1),
  title: z.string().min(2).max(200),
  content: z.string().min(1),
  order: z.number().int().min(0),
  status: z.enum(["BORRADOR", "EN_REVISION", "PUBLICADO", "ARCHIVADO"]).default("BORRADOR"),
});

export async function upsertLesson(input: z.infer<typeof UpsertLessonSchema>) {
  const data = UpsertLessonSchema.parse(input);
  if (data.id) {
    return db.lesson.update({ where: { id: data.id }, data });
  }
  return db.lesson.create({ data });
}

// ---------------------------------------------------------------------------
// Preguntas y respuestas
// ---------------------------------------------------------------------------

export const AnswerInputSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean(),
  order: z.number().int().min(0),
});

export const UpsertQuestionSchema = z
  .object({
    id: z.string().min(1).optional(),
    examVersionId: z.string().min(1),
    areaId: z.string().min(1),
    subjectId: z.string().min(1),
    topicId: z.string().min(1),
    text: z.string().min(5),
    difficulty: z.enum(["BAJA", "MEDIA", "ALTA"]),
    skill: z.string().max(120).optional(),
    tags: z.array(z.string().max(60)).max(10).default([]),
    estimatedTimeSeconds: z.number().int().min(10).max(600).default(60),
    status: z.enum(["BORRADOR", "EN_REVISION", "PUBLICADO", "ARCHIVADO"]).default("BORRADOR"),
    authorId: z.string().min(1),
    answers: z.array(AnswerInputSchema).min(2).max(6),
  })
  .refine((data) => data.answers.filter((a) => a.isCorrect).length === 1, {
    message: "Cada pregunta de opción múltiple debe tener exactamente una respuesta correcta.",
  });

export async function upsertQuestion(input: z.infer<typeof UpsertQuestionSchema>) {
  const data = UpsertQuestionSchema.parse(input);

  if (data.id) {
    return db.$transaction(async (tx) => {
      await tx.answer.deleteMany({ where: { questionId: data.id } });
      return tx.question.update({
        where: { id: data.id },
        data: {
          examVersionId: data.examVersionId,
          areaId: data.areaId,
          subjectId: data.subjectId,
          topicId: data.topicId,
          text: data.text,
          difficulty: data.difficulty,
          skill: data.skill,
          tags: data.tags,
          estimatedTimeSeconds: data.estimatedTimeSeconds,
          status: data.status,
          answers: { create: data.answers },
        },
      });
    });
  }

  return db.question.create({
    data: {
      examVersionId: data.examVersionId,
      areaId: data.areaId,
      subjectId: data.subjectId,
      topicId: data.topicId,
      text: data.text,
      difficulty: data.difficulty,
      skill: data.skill,
      tags: data.tags,
      estimatedTimeSeconds: data.estimatedTimeSeconds,
      status: data.status,
      authorId: data.authorId,
      answers: { create: data.answers },
    },
  });
}

export async function archiveQuestion(questionId: string) {
  return db.question.update({
    where: { id: questionId },
    data: { status: "ARCHIVADO", deletedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Lectura para el alumno (sólo contenido publicado, sin is_correct)
// ---------------------------------------------------------------------------

export async function getPublishedCurriculum() {
  return db.subject.findMany({
    orderBy: { order: "asc" },
    include: {
      topics: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            where: { status: "PUBLICADO", deletedAt: null },
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true },
          },
        },
      },
    },
  });
}
