import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  attempt: vi.fn(),
  questions: vi.fn(),
  claim: vi.fn(),
  save: vi.fn(),
  progressFind: vi.fn(),
  progressSave: vi.fn(),
  result: vi.fn(),
  finish: vi.fn(),
  lock: vi.fn(),
  saved: vi.fn(),
  priority: vi.fn(),
  review: vi.fn(),
}));
vi.mock("../src/db/client", () => ({
  db: {
    attempt: { findUnique: m.attempt },
    question: { findMany: m.questions },
    attemptAnswer: { findMany: m.saved },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: m.lock,
        attempt: { updateMany: m.claim, update: m.finish },
        attemptAnswer: { upsert: m.save },
        progress: { findUnique: m.progressFind, upsert: m.progressSave },
        examResult: { create: m.result },
      }),
  },
}));
vi.mock("../src/server/use-cases/study-priority", () => ({ recalculateTopicPriority: m.priority }));
vi.mock("../src/server/use-cases/attempt-review", () => ({ getAttemptReview: m.review }));
import { submitAttempt, SubmitAttemptSchema } from "../src/server/use-cases/submit-attempt";
import { ALL_CAREER_ACCESS } from "@/lib/license-career-access";
const id = "uaq26-interactive-v4-03";
const attempt = () => ({
  id: "attempt",
  userId: "student",
  type: "SIMULADOR",
  status: "EN_CURSO",
  startedAt: new Date(),
  config: { timeLimitSeconds: 3600, questionIds: [id], answerModes: { [id]: "STRUCTURED" } },
});
const input = () =>
  SubmitAttemptSchema.parse({
    attemptId: "attempt",
    userId: "student",
    expectedType: "SIMULADOR",
    answers: [
      {
        questionId: id,
        selectedAnswerId: null,
        response: { placements: { a: "n", b: "j", c: "p", d: "w" } },
      },
    ],
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.attempt.mockResolvedValue(attempt());
  m.questions.mockResolvedValue([
    {
      id,
      text: "Relaciona unidades",
      topicId: "topic",
      subjectId: "subject",
      answers: [{ id: "correct", isCorrect: true, text: "Clave" }],
    },
  ]);
  m.claim.mockResolvedValue({ count: 1 });
  m.review.mockResolvedValue(null);
  m.progressFind.mockResolvedValue(null);
  m.saved.mockResolvedValue([]);
});
describe("Entrega, progreso y tiempo", () => {
  it("no permite reutilizar un intento de otra carrera para obtener respuestas", async () => {
    m.attempt.mockResolvedValue({ ...attempt(), config: { ...attempt().config, careerId: "uaq-2026-1-02" } });
    await expect(submitAttempt(input(), { ...ALL_CAREER_ACCESS, careerScope: "SINGLE_CAREER", selectedCareerId: "uaq-2026-1-01" })).rejects.toThrow("solo permite");
    expect(m.questions).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("una pregunta ajena al temario no puede filtrarse mediante un intento con carrera correcta", async () => {
    m.attempt.mockResolvedValue({ ...attempt(), config: { ...attempt().config, careerId: "uaq-2026-1-01" } });
    await expect(submitAttempt(input(), { ...ALL_CAREER_ACCESS, careerScope: "SINGLE_CAREER", selectedCareerId: "uaq-2026-1-01" })).rejects.toThrow("no pertenece");
    expect(m.save).not.toHaveBeenCalled();
  });
  it("califica parcialmente, conserva el payload y genera resultado por asignatura", async () => {
    const result = await submitAttempt(input());
    expect(result.score).toBe(50);
    expect(result.correctCount).toBe(0);
    expect(m.save.mock.calls[0]![0].create).toMatchObject({
      credit: 0.5,
      isCorrect: false,
      response: { placements: { a: "n", b: "j", c: "p", d: "w" } },
    });
    expect(m.result.mock.calls[0]![0].data).toMatchObject({
      score: 50,
      correctCount: 0,
      totalCount: 1,
    });
    expect(m.lock).toHaveBeenCalledOnce();
  });
  it("no permite entregar el intento de otra persona", async () => {
    m.attempt.mockResolvedValue({ ...attempt(), userId: "other" });
    await expect(submitAttempt(input())).rejects.toThrow("no pertenece");
    expect(m.questions).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("no duplica progreso si una entrega concurrente ya ganó la comparación", async () => {
    m.claim.mockResolvedValue({ count: 0 });
    await expect(submitAttempt(input())).rejects.toThrow("ya fue entregado");
    expect(m.progressSave).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it("al vencer el tiempo ignora respuestas nuevas y califica solo lo guardado", async () => {
    m.attempt.mockResolvedValue({ ...attempt(), startedAt: new Date(Date.now() - 3601_000) });
    m.saved.mockResolvedValue([
      { questionId: id, selectedAnswerId: null, response: { placements: { a: "n" } } },
    ]);
    const result = await submitAttempt(input());
    expect(result.score).toBe(25);
  });
  it("si vence sin respuestas guardadas conserva un resultado de cero", async () => {
    m.attempt.mockResolvedValue({ ...attempt(), startedAt: new Date(Date.now() - 3601_000) });
    expect((await submitAttempt(input())).score).toBe(0);
  });
  it("un fallo de recálculo de recomendaciones no convierte una entrega guardada en error", async () => {
    m.priority.mockRejectedValue(new Error("temporary"));
    expect((await submitAttempt(input())).score).toBe(50);
  });
  it("rechaza respuestas convencionales usadas para saltarse la calificación estructurada", async () => {
    const data = input();
    data.answers[0]!.selectedAnswerId = "correct";
    await expect(submitAttempt(data)).rejects.toThrow("Formato");
  });
});
