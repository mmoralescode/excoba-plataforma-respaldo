import { PrismaClient } from "@prisma/client";
import { curriculum, questions } from "../src/content/bank";

const db = new PrismaClient();
const prefix = "uaq-2026-2";

async function main() {
  const email = process.env.CONTENT_AUTHOR_EMAIL?.trim().toLowerCase();
  const author = email
    ? await db.user.findUnique({
        where: { email },
        include: { roles: { include: { role: true } } },
      })
    : await db.user.findFirst({
        where: {
          status: "ACTIVO",
          roles: { some: { role: { name: { in: ["SUPER_ADMIN", "EDITOR_ACADEMICO"] } } } },
        },
        orderBy: { createdAt: "asc" },
        include: { roles: { include: { role: true } } },
      });
  if (
    !author ||
    author.status !== "ACTIVO" ||
    !author.roles.some(({ role }) => ["SUPER_ADMIN", "EDITOR_ACADEMICO"].includes(role.name))
  ) {
    throw new Error(
      "No existe un editor académico o administrador activo para atribuir el contenido.",
    );
  }
  await db.$transaction(
    async (tx) => {
      await tx.examVersion.upsert({
        where: { id: prefix },
        update: {},
        create: { id: prefix, name: "UAQ Licenciatura 2026-2", isActive: true },
      });
      for (const [id, name] of [
        ["1", "Primaria"],
        ["2", "Secundaria"],
        ["3", "Especialidad"],
      ] as const) {
        await tx.examArea.upsert({
          where: { id: `${prefix}-area-${id}` },
          update: {},
          create: { id: `${prefix}-area-${id}`, examVersionId: prefix, name, order: Number(id) },
        });
      }
      for (const [order, subject] of curriculum.subjects.entries()) {
        await tx.subject.upsert({
          where: { id: `${prefix}-subject-${subject.id}` },
          update: {},
          create: {
            id: `${prefix}-subject-${subject.id}`,
            areaId: `${prefix}-area-${subject.id[0]}`,
            name: subject.name,
            order,
          },
        });
      }
      for (const [order, topic] of curriculum.topics.entries()) {
        await tx.topic.upsert({
          where: { id: `${prefix}-topic-${topic.id}` },
          update: {},
          create: {
            id: `${prefix}-topic-${topic.id}`,
            subjectId: `${prefix}-subject-${topic.subjectId}`,
            name: `${topic.id} · ${topic.name}`,
            order,
          },
        });
      }
      for (const q of questions) {
        const topic = curriculum.topics.find((t) => t.id === q.topicId)!;
        // IDs versionados e inmutables: una reimportación no cambia las respuestas
        // que respaldan intentos anteriores, ni sobrescribe ediciones académicas.
        await tx.question.upsert({
          where: { id: q.id },
          update: {},
          create: {
            id: q.id,
            examVersionId: prefix,
            areaId: `${prefix}-area-${topic.subjectId[0]}`,
            subjectId: `${prefix}-subject-${topic.subjectId}`,
            topicId: `${prefix}-topic-${topic.id}`,
            text: q.text,
            difficulty: "MEDIA",
            status: "PUBLICADO",
            authorId: author.id,
            tags: [
              "original",
              "uaq-2026-2",
              ...(q.demoId
                ? [`demo:${q.demoId}`]
                : [
                    q.id.startsWith("uaq26-coverage-")
                      ? "cobertura-v3"
                      : q.id.startsWith("uaq26-interactive-")
                        ? "interactivo-v4"
                        : q.id.startsWith("uaq26-reinforce-")
                          ? "refuerzo-v5"
                          : "simulador-ampliacion-v2",
                  ]),
              `tema:${q.topicId}`,
            ],
            answers: {
              create: q.options.map((text, order) => ({
                id: `${q.id}-answer-${order}`,
                text,
                order,
                isCorrect: order === q.correctIndex,
              })),
            },
          },
        });
      }
      // Solo los siete placeholders exactos del seed antiguo; conservamos historial.
      const names = [
        "Matemáticas",
        "Física",
        "Biología",
        "Lenguaje",
        "Química",
        "Ciencias Sociales",
        "Humanidades",
      ];
      for (const [i, name] of names.entries()) {
        await tx.question.updateMany({
          where: {
            examVersionId: "convocatoria-demo",
            topicId: `topic-${i}-intro`,
            text: `Pregunta de ejemplo de ${name} (reemplazar con banco real de la guía).`,
          },
          data: { status: "ARCHIVADO" },
        });
      }
    },
    { timeout: 240000 },
  );
  console.info(
    `Contenido disponible: ${curriculum.topics.length} temas y ${questions.length} preguntas. Importación idempotente completada.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
