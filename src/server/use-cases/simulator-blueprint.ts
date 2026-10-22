import { getCareer, subjectDbId } from "@/content/study-plan";
import { subjectNames } from "@/content/subject-catalog";

export function fullExamSubjects(careerId?: string) {
  const career = getCareer(careerId);
  if (!career || new Set(career.subjectIds).size !== 3) {
    throw new Error(
      "Selecciona una carrera con tres asignaturas EXCOBA confirmadas para el simulador completo.",
    );
  }
  return ["1.1", "1.2", "2.1", "2.2", "2.3", "2.4", ...career.subjectIds].map(subjectDbId);
}

/** The caller shuffles first. Exact quotas, no substitution between subjects. */
export function selectFullExam<T extends { id: string; subjectId: string }>(
  candidates: T[],
  subjectIds: string[],
) {
  return subjectIds.flatMap((subjectId) => {
    const available = candidates.filter((q) => q.subjectId === subjectId);
    if (available.length < 20) {
      const name = subjectNames[subjectId.replace("uaq-2026-2-subject-", "")] ?? subjectId;
      throw new Error(
        `${name}: quedan ${available.length} preguntas nuevas; se necesitan 20. No se repetirán preguntas de tus intentos anteriores. Puedes continuar en Práctica.`,
      );
    }
    return available.slice(0, 20);
  });
}
