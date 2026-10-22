import { describe, expect, it } from "vitest";
import {
  careers,
  careerTopicIds,
  getCareer,
  isCareerSubject,
  isCommonSubject,
  officialSubjects,
  officialTopics,
  selectPracticeQuestions,
  topicDbId,
} from "../src/content/study-plan";

describe("Temario del examen por carrera", () => {
  it("conserva las seis asignaturas comunes para todas las carreras", () => {
    expect(officialSubjects.filter((s) => isCommonSubject(s.id)).map((s) => s.id)).toEqual([
      "1.1",
      "1.2",
      "2.1",
      "2.2",
      "2.3",
      "2.4",
    ]);
    expect(isCommonSubject("2.999")).toBe(false);
    expect(isCommonSubject("3.1")).toBe(false);
    for (const career of careers) {
      expect(officialSubjects.filter((s) => isCareerSubject(s.id, career))).toHaveLength(9);
      const expected = officialTopics.filter(
        (t) => isCommonSubject(t.subjectId) || career.subjectIds.includes(t.subjectId),
      );
      expect(careerTopicIds(career)).toEqual(expected.map((t) => topicDbId(t.id)));
      expect(new Set(careerTopicIds(career)).size).toBe(expected.length);
    }
  });

  it("la ruta de Medicina excluye otras especialidades y contenido propio", () => {
    const medicine = getCareer("uaq-2026-1-01")!;
    const ids = careerTopicIds(medicine);
    expect(ids).toContain(topicDbId("1.1.1"));
    expect(ids).toContain(topicDbId("2.1.1"));
    expect(ids).toContain(topicDbId("3.1.1.1"));
    expect(ids).not.toContain("custom-topic");
    for (const topic of officialTopics.filter((t) =>
      ["3.2", "3.3", "3.5", "3.7", "3.8"].includes(t.subjectId),
    )) {
      expect(ids).not.toContain(topicDbId(topic.id));
    }
  });

  it("avanza a las áreas comunes y opcionales antes de repetir especialidades agotadas", () => {
    const medicine = getCareer("uaq-2026-1-01")!;
    const pool = [
      { id: "specific", topicId: topicDbId("3.1.1.1") },
      { id: "common", topicId: topicDbId("1.1.1") },
      { id: "other", topicId: topicDbId("3.2.1.1") },
      { id: "extra", topicId: "custom-topic" },
    ];
    const seen = new Set<string>();
    for (const expected of ["specific", "common", "other", "extra"]) {
      const session = selectPracticeQuestions(pool, medicine, seen, 1);
      expect(session[0]!.id).toBe(expected);
      seen.add(expected);
    }
    expect(selectPracticeQuestions(pool, medicine, seen, 1)[0]!.id).toBe("specific");
    expect(pool[0]!.id).toBe("specific");
  });
});
