import { db } from "@/db/client";
import type { Difficulty, Priority } from "@prisma/client";

/**
 * Pesos y umbrales del algoritmo de priorización. Documentados como
 * configuración editable por SUPER_ADMIN (ver Módulo 1, sección 15); en
 * este módulo se dejan como constantes con un punto único de lectura
 * (`getPriorityConfig`) para poder moverlos a una tabla de configuración en
 * el panel administrativo sin tocar el resto del algoritmo.
 */
export interface PriorityConfig {
  pesoPrecision: number;
  pesoInactividad: number;
  pesoErroresRecientes: number;
  pesoDificultad: number;
  umbralAlta: number;
  umbralMedia: number;
  diasInactividadTope: number;
}

const DEFAULT_CONFIG: PriorityConfig = {
  pesoPrecision: 0.6,
  pesoInactividad: 1.2,
  pesoErroresRecientes: 3,
  pesoDificultad: 5,
  umbralAlta: 60,
  umbralMedia: 30,
  diasInactividadTope: 30,
};

export function getPriorityConfig(): PriorityConfig {
  // Punto de extensión: leer de una tabla `platform_config` cuando exista
  // el panel de configuración (Módulo 9). Por ahora usa los valores por
  // defecto documentados en el diseño.
  return DEFAULT_CONFIG;
}

const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { BAJA: 1, MEDIA: 2, ALTA: 3 };

/**
 * Recalcula la prioridad de un tema para un usuario a partir de su
 * `progress` actual y de sus intentos recientes en ese tema. Ver fórmula
 * completa en Módulo 1, sección 15.
 */
export async function recalculateTopicPriority(userId: string, topicId: string) {
  const config = getPriorityConfig();

  const progress = await db.progress.findUnique({
    where: { userId_topicId: { userId, topicId } },
  });
  if (!progress) return null;

  const recentAnswers = await db.attemptAnswer.findMany({
    where: {
      question: { topicId },
      attempt: { userId, status: "ENTREGADO" },
    },
    orderBy: { answeredAt: "desc" },
    take: 10,
    include: { question: { select: { difficulty: true } } },
  });

  const erroresRecientes = recentAnswers.filter((a) => a.isCorrect === false).length;
  const falladas = recentAnswers.filter((a) => a.isCorrect === false);
  const dificultadPromedioFallada =
    falladas.length > 0
      ? falladas.reduce((sum, a) => sum + DIFFICULTY_WEIGHT[a.question.difficulty], 0) /
        falladas.length
      : 0;

  const diasInactivo = progress.lastPracticedAt
    ? Math.floor((Date.now() - progress.lastPracticedAt.getTime()) / (1000 * 60 * 60 * 24))
    : config.diasInactividadTope;

  const riesgo =
    (100 - progress.accuracyPct) * config.pesoPrecision +
    Math.min(diasInactivo, config.diasInactividadTope) * config.pesoInactividad +
    erroresRecientes * config.pesoErroresRecientes +
    dificultadPromedioFallada * config.pesoDificultad;

  const priority: Priority =
    riesgo >= config.umbralAlta ? "ALTA" : riesgo >= config.umbralMedia ? "MEDIA" : "BAJA";

  return db.progress.update({
    where: { userId_topicId: { userId, topicId } },
    data: { priority, trend: riesgo },
  });
}

/** Devuelve los temas recomendados para hoy, ordenados por prioridad. */
export async function getStudyRecommendations(userId: string) {
  const items = await db.progress.findMany({
    where: { userId },
    include: { topic: { include: { subject: true } } },
  });

  const priorityOrder: Record<Priority, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
  return items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
