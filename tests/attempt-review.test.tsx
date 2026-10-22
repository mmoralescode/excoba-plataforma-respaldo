import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("../src/db/client", () => ({ db: { attempt: { findFirst: m.find } } }));
import { getAttemptReview } from "../src/server/use-cases/attempt-review";
import { questions } from "../src/content/bank";
import { AttemptFeedback } from "../src/components/attempt-feedback";
import { ALL_CAREER_ACCESS } from "@/lib/license-career-access";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
});
afterEach(() => vi.unstubAllGlobals());
describe("Revisión privada", () => {
  it("no expone claves de intentos ajenos a la carrera contratada", async () => {
    m.find.mockResolvedValue({ config: { careerId: "uaq-2026-1-02" }, answers: [] });
    expect(await getAttemptReview("attempt", "student", {
      ...ALL_CAREER_ACCESS, careerScope: "SINGLE_CAREER", selectedCareerId: "uaq-2026-1-01",
    })).toBeNull();
  });
  it("consulta únicamente intentos entregados del usuario autenticado", async () => {
    m.find.mockResolvedValue(null);
    expect(await getAttemptReview("attempt", "student")).toBeNull();
    expect(m.find.mock.calls[0]![0].where).toEqual({
      id: "attempt",
      userId: "student",
      status: "ENTREGADO",
    });
  });
  it("muestra respuesta, explicación original y enlace al tema sin pedir otro folio", async () => {
    const q = questions[0]!;
    m.find.mockResolvedValue({
      score: 0,
      config: null,
      answers: [
        {
          isCorrect: false,
          selectedAnswerId: null,
          credit: null,
          question: {
            ...q,
            topicId: "uaq-2026-2-topic-" + q.topicId,
            subjectId: "uaq-2026-2-subject-1.1",
            answers: q.options.map((text, i) => ({
              id: String(i),
              text,
              isCorrect: i === q.correctIndex,
            })),
          },
        },
      ],
    });
    const result = await getAttemptReview("attempt", "student");
    expect(result!.review[0]!.explanation).toBe(q.explanation);
    const html = renderToStaticMarkup(<AttemptFeedback review={result!.review} />);
    expect(html).toContain("Sin respuesta");
    expect(html).toContain("/practica?subject=");
    expect(html).toContain("topic=");
    expect(html).not.toContain("/activar");
  });
});
