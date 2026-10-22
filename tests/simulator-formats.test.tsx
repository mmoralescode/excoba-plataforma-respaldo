import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { questions } from "../src/content/bank";
import {
  assignAnswerModes,
  dragCategory,
  recoverAnswerMode,
  selectMixedQuestions,
  usedSimulatorQuestionIds,
} from "../src/server/use-cases/simulator-formats";
import { SimulatorQuestionAnswer } from "../src/components/simulator-question-answer";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
describe("Formatos mixtos del simulador", () => {
  it("reserva Historia y Biología y algunas de Geometría y Física sin duplicarlas", () => {
    const selected = selectMixedQuestions(questions, 60);
    expect(selected).toHaveLength(60);
    expect(new Set(selected.map((q) => q.id)).size).toBe(60);
    const modes = assignAnswerModes(selected);
    for (const category of ["history", "biology", "geometry", "physics"]) {
      const draggable = selected.filter(
        (q) => modes[q.id] === "DRAG_DROP" && dragCategory(q) === category,
      );
      expect(draggable.length).toBeGreaterThan(0);
      if (["geometry", "physics"].includes(category))
        expect(draggable.length).toBeLessThanOrEqual(2);
    }
    expect(Object.values(modes).filter((m) => m === "MULTIPLE_CHOICE").length).toBeGreaterThan(30);
  });
  it("no confunde toda ciencia social con historia ni toda matemática con geometría", () => {
    expect(dragCategory({ id: "weber", topicId: "uaq-2026-2-topic-3.7.1.3" })).toBeNull();
    expect(dragCategory({ id: "history", topicId: "uaq-2026-2-topic-3.7.3.2" })).toBe("history");
    expect(dragCategory({ id: "algebra", topicId: "3.2.1.3" })).toBeNull();
    expect(dragCategory({ id: "unknown" })).toBeNull();
  });
  it("mantiene exactamente el formato guardado tras recargar", () => {
    const config = { answerModes: { q1: "DRAG_DROP", q2: "MULTIPLE_CHOICE" } };
    expect(recoverAnswerMode(config, { id: "q1" })).toBe("DRAG_DROP");
    expect(recoverAnswerMode(config, { id: "q2", topicId: "3.4.1.3" })).toBe("MULTIPLE_CHOICE");
    expect(recoverAnswerMode(null, { id: "q3" })).toBe("MULTIPLE_CHOICE");
  });
  it("funciona aunque una materia ya no tenga preguntas inéditas", () => {
    const candidates = questions.filter((q) => !dragCategory(q));
    const selected = selectMixedQuestions(candidates, 60);
    expect(selected).toHaveLength(60);
    expect(Object.values(assignAnswerModes(selected))).not.toContain("DRAG_DROP");
  });
  it("reúne preguntas asignadas y respuestas históricas sin duplicarlas", () => {
    expect(
      usedSimulatorQuestionIds([
        { config: { questionIds: ["a", "b", "a", null] }, answers: [{ questionId: "c" }] },
        { config: null, answers: [{ questionId: "b" }] },
      ]),
    ).toEqual(["a", "b", "c"]);
  });
  it("muestra radios para opción múltiple y recuadro solo para arrastre", () => {
    const props = {
      questionId: "q1",
      answers: [
        { id: "a1", text: "Uno" },
        { id: "a2", text: "Dos" },
      ],
      selectedId: "a2",
      onSelect: () => {},
    };
    const multiple = renderToStaticMarkup(
      <SimulatorQuestionAnswer {...props} answerMode="MULTIPLE_CHOICE" />,
    );
    expect(multiple).toContain('type="radio"');
    expect(multiple).toContain('checked=""');
    expect(multiple).not.toContain("Suelta aquí");
    const drag = renderToStaticMarkup(
      <SimulatorQuestionAnswer {...props} answerMode="DRAG_DROP" />,
    );
    expect(drag).toContain("answer-drop-zone");
    expect(drag).not.toContain('type="radio"');
  });
});
