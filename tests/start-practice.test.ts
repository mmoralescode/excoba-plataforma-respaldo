import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  findQuestions: vi.fn(),
  findAnswers: vi.fn(),
  createAttempt: vi.fn(),
}));
vi.mock("../src/db/client", () => ({
  db: {
    question: { findMany: mock.findQuestions },
    attemptAnswer: { findMany: mock.findAnswers },
    attempt: { create: mock.createAttempt },
  },
}));
import { startPractice, StartPracticeSchema } from "../src/server/use-cases/start-practice";
import {
  careers,
  careerTopicIds,
  getCareer,
  officialTopicIds,
  topicDbId,
} from "../src/content/study-plan";
import { ALL_CAREER_ACCESS, type LicenseAccess } from "@/lib/license-career-access";

const singleAccess: LicenseAccess = {
  ...ALL_CAREER_ACCESS, validityMonths: 2, careerScope: "SINGLE_CAREER", selectedCareerId: "uaq-2026-1-01",
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.findAnswers.mockResolvedValue([]);
  mock.createAttempt.mockResolvedValue({ id: "attempt" });
});
describe("Inicio de práctica con carrera", () => {
  it("impide carreras ajenas y planes sin primera elección aun con parámetros manipulados", async () => {
    for (const access of [singleAccess, { ...singleAccess, selectedCareerId: null }]) {
      await expect(startPractice({ userId: "u", careerId: "uaq-2026-1-02" }, access)).rejects.toThrow();
    }
    expect(mock.findQuestions).not.toHaveBeenCalled();
    expect(mock.createAttempt).not.toHaveBeenCalled();
  });
  it.each(["all", "extra"] as const)("el plan de una carrera no abre scope=%s", async (scope) => {
    await expect(startPractice({ userId: "u", careerId: singleAccess.selectedCareerId!, scope }, singleAccess)).rejects.toThrow("solo permite");
    expect(mock.findQuestions).not.toHaveBeenCalled();
  });
  it("rechaza un tema fuera de carrera y restringe los enlaces oficiales al temario permitido", async () => {
    await expect(startPractice({ userId: "u", careerId: singleAccess.selectedCareerId!, topicId: topicDbId("3.2.1.1") }, singleAccess)).rejects.toThrow();
    mock.findQuestions.mockResolvedValue([]);
    await startPractice({ userId: "u", careerId: singleAccess.selectedCareerId!, scope: "official" }, singleAccess);
    const where = mock.findQuestions.mock.calls[0]![0].where;
    expect(where.AND[1]).toEqual({ topicId: { in: careerTopicIds(getCareer(singleAccess.selectedCareerId)!) } });
    expect(where.AND[2]).toEqual(where.AND[1]);
  });
  it("rechaza carrera faltante o inventada antes de consultar la base", async () => {
    expect(StartPracticeSchema.safeParse({ userId: "u", careerId: "inventada" }).success).toBe(
      false,
    );
    await expect(startPractice({ userId: "u", careerId: "" })).rejects.toThrow();
    expect(mock.findQuestions).not.toHaveBeenCalled();
  });
  it("guarda exactamente las preguntas asignadas y no selecciona campos con respuestas correctas", async () => {
    mock.findQuestions.mockResolvedValue([
      { id: "extra", topicId: "custom", text: "Extra", answers: [] },
      { id: "official", topicId: topicDbId("3.1.1.1"), text: "Oficial", answers: [] },
    ]);
    const result = await startPractice({ userId: "u", careerId: careers[0]!.id, questionCount: 1 });
    expect(result.questions.map((q) => q.id)).toEqual(["official"]);
    expect(mock.createAttempt.mock.calls[0]![0].data.config.questionIds).toEqual(["official"]);
    expect(mock.findQuestions.mock.calls[0]![0].select.answers.select).not.toHaveProperty(
      "isCorrect",
    );
  });
  it("no crea intentos vacíos", async () => {
    mock.findQuestions.mockResolvedValue([]);
    expect(await startPractice({ userId: "u", careerId: careers[0]!.id })).toEqual({
      attemptId: null,
      questions: [],
    });
    expect(mock.createAttempt).not.toHaveBeenCalled();
  });

  it("por defecto consulta solo las áreas de la carrera y el tronco común", async () => {
    mock.findQuestions.mockResolvedValue([]);
    const career = getCareer("uaq-2026-1-01")!;
    await startPractice({ userId: "u", careerId: career.id });
    const where = mock.findQuestions.mock.calls[0]![0].where;
    expect(where.AND[1]).toEqual({ topicId: { in: careerTopicIds(career) } });
    expect(where.status).toBe("PUBLICADO");
    expect(where.deletedAt).toBeNull();
  });

  it("todos los temas es una elección explícita y no aplica el filtro de carrera", async () => {
    mock.findQuestions.mockResolvedValue([]);
    await startPractice({ userId: "u", careerId: careers[0]!.id, scope: "all" });
    expect(mock.findQuestions.mock.calls[0]![0].where.AND[1]).toEqual({});
  });

  it("intersecta las selecciones de área/tema con el temario de la carrera", async () => {
    mock.findQuestions.mockResolvedValue([]);
    const career = getCareer("uaq-2026-1-01")!;
    const outsideTopic = topicDbId("3.2.1.1");
    await startPractice({
      userId: "u",
      careerId: career.id,
      scope: "career",
      topicId: outsideTopic,
    });
    const where = mock.findQuestions.mock.calls[0]![0].where;
    expect(where.AND[0]).toEqual({ topicId: outsideTopic });
    expect(where.AND[1].topicId.in).not.toContain(outsideTopic);
  });

  it.each(["official", "extra"] as const)(
    "mantiene la selección explícita de contenido %s",
    async (scope) => {
      mock.findQuestions.mockResolvedValue([]);
      await startPractice({ userId: "u", careerId: careers[0]!.id, scope });
      expect(mock.findQuestions.mock.calls[0]![0].where.AND[1]).toEqual({
        topicId: scope === "official" ? { in: officialTopicIds } : { notIn: officialTopicIds },
      });
    },
  );
});
