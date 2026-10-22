import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findQuestions: vi.fn(),
  createAttempt: vi.fn(),
  findAttempt: vi.fn(),
  findQuestion: vi.fn(),
  savedAnswers: vi.fn(),
  upsertAnswer: vi.fn(),
  transaction: vi.fn(),
  lock: vi.fn(),
  history: vi.fn(),
}));
vi.mock("../src/db/client", () => ({
  db: {
    $transaction: mocks.transaction,
    question: { findMany: mocks.findQuestions, findUnique: mocks.findQuestion },
    attempt: { create: mocks.createAttempt, findUnique: mocks.findAttempt },
    attemptAnswer: { findMany: mocks.savedAnswers, upsert: mocks.upsertAnswer },
  },
}));
import { startSimulator, StartSimulatorSchema } from "../src/server/use-cases/start-simulator";
import { saveSimulatorAnswer, getSimulatorState } from "../src/server/use-cases/simulator-state";
import { ALL_CAREER_ACCESS, type LicenseAccess, allowedCareerSubjectIds, allowedCareerTopicIds } from "@/lib/license-career-access";
const singleAccess: LicenseAccess = {
  ...ALL_CAREER_ACCESS, validityMonths: 2, careerScope: "SINGLE_CAREER", selectedCareerId: "uaq-2026-1-01",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.lock.mockResolvedValue([{ id: "student" }]);
  mocks.history.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      $queryRaw: mocks.lock,
      question: { findMany: mocks.findQuestions },
      attempt: {
        findMany: mocks.history,
        create: mocks.createAttempt,
        findUnique: mocks.findAttempt,
      },
      attemptAnswer: { upsert: mocks.upsertAnswer },
    }),
  );
  mocks.createAttempt.mockResolvedValue({ id: "attempt-60", startedAt: new Date() });
  mocks.findAttempt.mockResolvedValue({
    id: "attempt-60",
    userId: "student",
    type: "SIMULADOR",
    status: "EN_CURSO",
    startedAt: new Date(),
    config: { timeLimitSeconds: 3600, questionIds: ["q1", "q2"] },
  });
});
describe("Sesiones ampliadas del simulador", () => {
  it("rechaza otra carrera y materias ajenas también en el simulador corto", async () => {
    await expect(startSimulator(StartSimulatorSchema.parse({ userId: "student", mode: "short", careerId: "uaq-2026-1-02" }), singleAccess)).rejects.toThrow("solo permite");
    await expect(startSimulator(StartSimulatorSchema.parse({ userId: "student", mode: "short", subjectIds: ["forged"] }), singleAccess)).rejects.toThrow("no pertenece");
    await expect(startSimulator(StartSimulatorSchema.parse({ userId: "student" }), { ...singleAccess, selectedCareerId: null })).rejects.toThrow("Primero confirma");
    expect(mocks.findQuestions).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("el simulador corto sin filtros siempre aplica la carrera confirmada", async () => {
    mocks.findQuestions.mockResolvedValue([]);
    await expect(startSimulator(StartSimulatorSchema.parse({ userId: "student" }), singleAccess)).rejects.toThrow("Quedan 0");
    expect(mocks.findQuestions.mock.calls[0]![0].where).toMatchObject({
      subjectId: { in: allowedCareerSubjectIds(singleAccess) },
      topicId: { in: allowedCareerTopicIds(singleAccess) },
    });
  });
  it("no recupera ni escribe intentos anteriores sin carrera para un plan restringido", async () => {
    await expect(getSimulatorState("attempt-60", "student", singleAccess)).rejects.toThrow("no corresponde");
    await expect(saveSimulatorAnswer({ attemptId: "attempt-60", userId: "student", questionId: "q1", selectedAnswerId: null, flaggedForReview: false }, singleAccess)).rejects.toThrow("no corresponde");
    expect(mocks.findQuestions).not.toHaveBeenCalled();
    expect(mocks.upsertAnswer).not.toHaveBeenCalled();
  });
  it("asigna 60 preguntas distintas, persiste el conjunto y no consulta claves correctas", async () => {
    mocks.findQuestions.mockResolvedValue(
      Array.from({ length: 158 }, (_, n) => ({
        id: `q${n}`,
        text: "Reactivo",
        subjectId: "subject",
        answers: [{ id: `a${n}`, text: "Opción" }],
      })),
    );
    const result = await startSimulator(StartSimulatorSchema.parse({ userId: "student" }));
    expect(result.questions).toHaveLength(60);
    expect(new Set(result.questions.map((q) => q.id)).size).toBe(60);
    expect(result.timeLimitSeconds).toBe(3600);
    expect(mocks.createAttempt.mock.calls[0]![0].data.config.questionIds).toEqual(
      result.questions.map((q) => q.id),
    );
    expect(mocks.findQuestions.mock.calls[0]![0].select.answers.select).toEqual({
      id: true,
      text: true,
    });
  });
  it("no inicia si no hay suficientes preguntas", async () => {
    mocks.findQuestions.mockResolvedValue([]);
    await expect(startSimulator(StartSimulatorSchema.parse({ userId: "student" }))).rejects.toThrow(
      "Quedan 0 preguntas nuevas",
    );
    expect(mocks.createAttempt).not.toHaveBeenCalled();
  });
  it("excluye todo lo asignado anteriormente, aun sin respuestas guardadas", async () => {
    mocks.history.mockResolvedValue([
      { config: { questionIds: ["used-unanswered"] }, answers: [] },
      { config: null, answers: [{ questionId: "legacy-answered" }] },
    ]);
    mocks.findQuestions.mockResolvedValue([]);
    await expect(startSimulator(StartSimulatorSchema.parse({ userId: "student" }))).rejects.toThrow(
      "sin repetir",
    );
    expect(mocks.history).toHaveBeenCalledWith({
      where: { userId: "student", type: "SIMULADOR" },
      select: { config: true, answers: { select: { questionId: true } } },
    });
    expect(mocks.findQuestions.mock.calls[0]![0].where.id.notIn).toEqual([
      "used-unanswered",
      "legacy-answered",
    ]);
    expect(mocks.lock.mock.calls[0]![0].join(" ")).toContain("FOR UPDATE");
    expect(mocks.lock.mock.calls[0]![1]).toBe("student");
  });

  it("dos inicios concurrentes reservan conjuntos distintos y el siguiente avisa agotamiento", async () => {
    const history: Array<{ config: { questionIds: string[] }; answers: [] }> = [];
    const bank = Array.from({ length: 158 }, (_, i) => ({ id: `q${i}`, answers: [] }));
    let queue = Promise.resolve();
    mocks.transaction.mockImplementation((callback) => {
      const run = queue.then(() =>
        callback({
          $queryRaw: mocks.lock,
          question: { findMany: mocks.findQuestions },
          attempt: { findMany: mocks.history, create: mocks.createAttempt },
        }),
      );
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    });
    mocks.history.mockImplementation(async () => [...history]);
    mocks.findQuestions.mockImplementation(async ({ where }) =>
      bank.filter((q) => !where.id.notIn.includes(q.id)),
    );
    mocks.createAttempt.mockImplementation(async ({ data }) => {
      history.push({ config: data.config, answers: [] });
      return { id: `attempt-${history.length}`, startedAt: new Date() };
    });
    const [first, second] = await Promise.all(
      [1, 2].map(() => startSimulator(StartSimulatorSchema.parse({ userId: "student" }))),
    );
    const firstIds = new Set(first!.questions.map((q) => q.id));
    expect(second!.questions.some((q) => firstIds.has(q.id))).toBe(false);
    expect(history).toHaveLength(2);
    await expect(startSimulator(StartSimulatorSchema.parse({ userId: "student" }))).rejects.toThrow(
      "Quedan 38 preguntas nuevas",
    );
    expect(history).toHaveLength(2);
  });
  it("guarda y elimina la respuesta arrastrada usando los mismos IDs", async () => {
    mocks.findQuestion.mockResolvedValue({ answers: [{ id: "a1" }] });
    for (const selectedAnswerId of ["a1", null]) {
      await saveSimulatorAnswer({
        attemptId: "attempt-60",
        userId: "student",
        questionId: "q1",
        selectedAnswerId,
        flaggedForReview: false,
      });
      expect(mocks.upsertAnswer).toHaveBeenLastCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ selectedAnswerId }) }),
      );
    }
  });
  it("rechaza opciones ajenas a la pregunta y cuentas ajenas al intento", async () => {
    mocks.findQuestion.mockResolvedValue({ answers: [{ id: "a1" }] });
    await expect(
      saveSimulatorAnswer({
        attemptId: "attempt-60",
        userId: "student",
        questionId: "q1",
        selectedAnswerId: "a2",
        flaggedForReview: false,
      }),
    ).rejects.toThrow("no es válida");
    await expect(getSimulatorState("attempt-60", "other-user")).rejects.toThrow("no encontrado");
    expect(mocks.upsertAnswer).not.toHaveBeenCalled();
  });
  it("recupera elecciones y orden original, sin revelar claves", async () => {
    const saved = [{ questionId: "q1", selectedAnswerId: "a1", flaggedForReview: false }];
    mocks.savedAnswers.mockResolvedValue(saved);
    mocks.findQuestions.mockResolvedValue([
      { id: "q2", answers: [] },
      { id: "q1", answers: [{ id: "a1", text: "Opción" }] },
    ]);
    const result = await getSimulatorState("attempt-60", "student");
    expect(result.savedAnswers).toEqual(saved);
    expect(result.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(mocks.findQuestions.mock.calls[0]![0].select.answers.select).toEqual({
      id: true,
      text: true,
    });
  });
  it("recupera una respuesta estructurada sin opciones que delaten la solución", async () => {
    const id = "uaq26-interactive-v4-06";
    mocks.findAttempt.mockResolvedValue({
      id: "attempt-60",
      userId: "student",
      type: "SIMULADOR",
      status: "EN_CURSO",
      startedAt: new Date(),
      config: { timeLimitSeconds: 3600, questionIds: [id], answerModes: { [id]: "STRUCTURED" } },
    });
    mocks.savedAnswers.mockResolvedValue([
      { questionId: id, response: { text: "0.5" }, selectedAnswerId: null },
    ]);
    mocks.findQuestions.mockResolvedValue([{ id, answers: [{ id: "a1", text: "0.5 mol/L" }] }]);
    const result = await getSimulatorState("attempt-60", "student");
    expect(result.questions[0]!.answers).toEqual([]);
    expect(result.questions[0]!.interaction?.kind).toBe("numeric");
    expect(result.savedAnswers[0]!.response).toEqual({ text: "0.5" });
  });
  it("rechaza una escritura cuando el intento fue entregado mientras esperaba el bloqueo", async () => {
    const base = {
      id: "attempt-60",
      userId: "student",
      type: "SIMULADOR",
      status: "EN_CURSO",
      startedAt: new Date(),
      config: { timeLimitSeconds: 3600, questionIds: ["q1"] },
    };
    mocks.findAttempt
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ ...base, status: "ENTREGADO" });
    mocks.findQuestion.mockResolvedValue({ answers: [{ id: "a1" }] });
    await expect(
      saveSimulatorAnswer({
        attemptId: "attempt-60",
        userId: "student",
        questionId: "q1",
        selectedAnswerId: "a1",
        flaggedForReview: false,
      }),
    ).rejects.toThrow("terminó");
    expect(mocks.upsertAnswer).not.toHaveBeenCalled();
  });
});
