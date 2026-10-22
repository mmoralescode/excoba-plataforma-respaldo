import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ subjects: vi.fn(), answers: vi.fn() }));
vi.mock("../src/db/client", () => ({
  db: {
    subject: { findMany: mock.subjects },
    attemptAnswer: { findMany: mock.answers },
  },
}));
import { getStudySubjects } from "../src/server/use-cases/study-subjects";
import { topicDbId, subjectDbId } from "../src/content/study-plan";
import { ALL_CAREER_ACCESS, type LicenseAccess, allowedCareerSubjectIds, allowedCareerTopicIds } from "@/lib/license-career-access";
const singleAccess: LicenseAccess = {
  ...ALL_CAREER_ACCESS, careerScope: "SINGLE_CAREER", validityMonths: 2, selectedCareerId: "uaq-2026-1-01",
};

describe("Progreso por asignatura", () => {
  it("no entrega contenido antes de confirmar una carrera", async () => {
    vi.clearAllMocks();
    expect(await getStudySubjects("student", { ...singleAccess, selectedCareerId: null })).toEqual([]);
    expect(mock.subjects).not.toHaveBeenCalled();
  });
  it("limita materias y lecciones del plan de una carrera desde la consulta", async () => {
    vi.clearAllMocks();
    mock.subjects.mockResolvedValue([]);
    mock.answers.mockResolvedValue([]);
    const result = await getStudySubjects("student", singleAccess);
    expect(result).toHaveLength(9);
    expect(result.some((subject) => subject.id === subjectDbId("3.2"))).toBe(false);
    expect(mock.subjects.mock.calls[0]![0]).toMatchObject({
      where: { id: { in: allowedCareerSubjectIds(singleAccess) } },
      include: { topics: { where: { id: { in: allowedCareerTopicIds(singleAccess) } } } },
    });
  });
  it("cuenta temas únicos, conserva lecciones y separa extras sin cambiar IDs", async () => {
    vi.clearAllMocks();
    mock.subjects.mockResolvedValue([
      {
        id: subjectDbId("1.1"),
        name: "Español",
        topics: [
          {
            id: topicDbId("1.1.1"),
            name: "Tema oficial",
            _count: { questions: 2 },
            lessons: [{ id: "lesson", title: "Lección", content: "Contenido" }],
          },
          { id: "custom", name: "Tema extra", _count: { questions: 1 }, lessons: [] },
        ],
      },
    ]);
    mock.answers.mockResolvedValue([
      { question: { topicId: topicDbId("1.1.1") } },
      { question: { topicId: topicDbId("1.1.1") } },
      { question: { topicId: "custom" } },
    ]);
    const result = await getStudySubjects("student-a");
    const spanish = result.find((s) => s.officialId === "1.1")!;
    expect(spanish.answered).toBe(1);
    expect(spanish.percent).toBe(10);
    expect(spanish.topics).toHaveLength(10);
    expect(spanish.topics[0]!.lessons[0]!.id).toBe("lesson");
    expect(result.find((s) => s.scope === "extra")!.answered).toBe(1);
    expect(result.find((s) => s.officialId === "3.8")!.percent).toBe(0);
    expect(mock.answers.mock.calls[0]![0].where).toEqual({
      attempt: { userId: "student-a", status: "ENTREGADO" },
      selectedAnswerId: { not: null },
    });
  });
});
