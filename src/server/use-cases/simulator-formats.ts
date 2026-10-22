export type SimulatorAnswerMode = "MULTIPLE_CHOICE" | "DRAG_DROP" | "STRUCTURED";
type Candidate = { id: string; topicId?: string };

// Solo algunas preguntas de geometría y física se prestan al arrastre simple.
const geometryIds = new Set(["uaq26-v1-012", "uaq26-sim-v2-007", "uaq26-sim-v2-008"]);
const physicsIds = new Set(["uaq26-v1-034", "uaq26-v1-036", "uaq26-v1-038", "uaq26-sim-v2-027"]);

export function dragCategory(question: Candidate) {
  const topic = question.topicId?.replace(/^uaq-2026-2-topic-/, "") ?? "";
  if (/^3\.7\.[234]\./.test(topic)) return "history";
  if (/^(3\.4\.|2\.3\.1\.)/.test(topic)) return "biology";
  if (geometryIds.has(question.id)) return "geometry";
  if (physicsIds.has(question.id)) return "physics";
  return null;
}

/** Recibe candidatos ya barajados; reserva variedad cuando quedan preguntas de esas áreas. */
export function selectMixedQuestions<T extends Candidate>(candidates: T[], count: number): T[] {
  const reserved: T[] = [];
  for (const category of ["history", "biology", "geometry", "physics"] as const) {
    if (reserved.length >= Math.floor(count / 2)) break;
    const question = candidates.find((candidate) => dragCategory(candidate) === category);
    if (question) reserved.push(question);
  }
  const ids = new Set(reserved.map((question) => question.id));
  return [...reserved, ...candidates.filter((question) => !ids.has(question.id))].slice(0, count);
}

export function assignAnswerModes(questions: Candidate[]): Record<string, SimulatorAnswerMode> {
  const modes: Record<string, SimulatorAnswerMode> = {};
  const used = { geometry: 0, physics: 0 };
  let dragCount = 0;
  // Mantener una mayoría de opción múltiple incluso si se filtra por una sola materia.
  const maxDrag = Math.floor((questions.length - 1) / 2);
  for (const question of questions) {
    const category = dragCategory(question);
    const limited = category === "geometry" || category === "physics";
    const drag = category !== null && dragCount < maxDrag && (!limited || used[category] < 2);
    modes[question.id] = drag ? "DRAG_DROP" : "MULTIPLE_CHOICE";
    if (drag) {
      dragCount++;
      if (limited) used[category]++;
    }
  }
  return modes;
}

export function recoverAnswerMode(config: unknown, question: Candidate): SimulatorAnswerMode {
  const modes = (config as { answerModes?: Record<string, unknown> } | null)?.answerModes;
  const saved = modes?.[question.id];
  if (saved === "DRAG_DROP" || saved === "MULTIPLE_CHOICE" || saved === "STRUCTURED") return saved;
  // Intentos previos conservan preguntas, elecciones y tiempo; reciben el formato por materia.
  return dragCategory(question) ? "DRAG_DROP" : "MULTIPLE_CHOICE";
}

export function usedSimulatorQuestionIds(
  history: Array<{ config: unknown; answers: Array<{ questionId: string }> }>,
) {
  const ids = new Set<string>();
  for (const attempt of history) {
    const assigned = (attempt.config as { questionIds?: unknown } | null)?.questionIds;
    if (Array.isArray(assigned)) for (const id of assigned) if (typeof id === "string") ids.add(id);
    for (const answer of attempt.answers) ids.add(answer.questionId);
  }
  return [...ids];
}
