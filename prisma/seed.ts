import { PrismaClient, RoleName, ContentStatus, Difficulty } from "@prisma/client";
import { hashPassword } from "../src/lib/security/password";

const db = new PrismaClient();

async function main() {
  console.warn("Sembrando datos de desarrollo...");

  // --- Roles ---
  const roleNames: RoleName[] = [
    "SUPER_ADMIN",
    "EDITOR_ACADEMICO",
    "SOPORTE",
    "ANALISTA",
    "ALUMNO",
  ];
  for (const name of roleNames) {
    await db.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // --- Usuario SUPER_ADMIN de desarrollo ---
  const adminEmail = "admin@excoba.local";
  const adminPasswordHash = await hashPassword("CambiaEstaPassword123!");

  const admin = await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      name: "Administrador EXCOBA",
    },
  });

  const superAdminRole = await db.role.findUniqueOrThrow({
    where: { name: "SUPER_ADMIN" },
  });

  await db.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superAdminRole.id },
  });

  // --- Producto ---
  await db.product.upsert({
    where: { id: "producto-guia-excoba" },
    update: {},
    create: {
      id: "producto-guia-excoba",
      name: "Guía EXCOBA — Acceso completo",
      description: "Acceso completo a la plataforma de estudio, práctica y simuladores.",
    },
  });

  // --- Convocatoria, área y materias (según la Guía EXCOBA) ---
  const examVersion = await db.examVersion.upsert({
    where: { id: "convocatoria-demo" },
    update: {},
    create: {
      id: "convocatoria-demo",
      name: "Convocatoria demo",
      isActive: true,
    },
  });

  const area = await db.examArea.upsert({
    where: { id: "area-general" },
    update: {},
    create: {
      id: "area-general",
      examVersionId: examVersion.id,
      name: "Bachillerato General",
      order: 1,
    },
  });

  const subjectNames = [
    "Matemáticas",
    "Física",
    "Biología",
    "Lenguaje",
    "Química",
    "Ciencias Sociales",
    "Humanidades",
  ];

  for (const [index, name] of subjectNames.entries()) {
    const subject = await db.subject.upsert({
      where: { id: `subject-${index}` },
      update: {},
      create: {
        id: `subject-${index}`,
        areaId: area.id,
        name,
        order: index + 1,
      },
    });

    const topic = await db.topic.upsert({
      where: { id: `topic-${index}-intro` },
      update: {},
      create: {
        id: `topic-${index}-intro`,
        subjectId: subject.id,
        name: `Introducción a ${name}`,
        order: 1,
      },
    });

    // Una pregunta de ejemplo por materia, publicada, para poder probar
    // el flujo de práctica de extremo a extremo.
    const existingQuestion = await db.question.findFirst({
      where: { topicId: topic.id },
    });

    if (!existingQuestion) {
      await db.question.create({
        data: {
          examVersionId: examVersion.id,
          areaId: area.id,
          subjectId: subject.id,
          topicId: topic.id,
          text: `Pregunta de ejemplo de ${name} (reemplazar con banco real de la guía).`,
          type: "OPCION_MULTIPLE",
          difficulty: Difficulty.MEDIA,
          status: ContentStatus.PUBLICADO,
          authorId: admin.id,
          answers: {
            create: [
              { text: "Opción A (correcta)", isCorrect: true, order: 1 },
              { text: "Opción B", isCorrect: false, order: 2 },
              { text: "Opción C", isCorrect: false, order: 3 },
              { text: "Opción D", isCorrect: false, order: 4 },
            ],
          },
        },
      });
    }
  }

  console.warn("Seed completado.");
  console.warn(`Admin: ${adminEmail} / CambiaEstaPassword123!`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
