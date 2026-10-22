import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import expansion from "../src/content/simulator-expansion.json";
import baseQuestions from "../src/content/questions.json";
import { questions, curriculum } from "../src/content/bank";
import { SimulatorAnswerBoard, isInsideDropZone } from "../src/components/simulator-answer-board";
import { SimulatorFormulaSheet } from "../src/components/simulator-formula-sheet";
import { formulaSheet } from "../src/content/formula-sheet";
import {
  SIMULATOR_QUESTION_COUNT,
  SIMULATOR_TIME_LIMIT_SECONDS,
} from "../src/content/simulator-settings";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("Ampliación del simulador", () => {
  it("añade exactamente 40 reactivos sin alterar los 118 anteriores", () => {
    expect(expansion).toHaveLength(40);
    expect(questions).toHaveLength(372);
    expect(questions.slice(0, baseQuestions.length)).toEqual(baseQuestions);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(new Set(questions.map((q) => q.text)).size).toBe(questions.length);
    expect(expansion.filter((q) => /^3\.[12]\./.test(q.topicId))).toHaveLength(14);
    expect(expansion.filter((q) => q.topicId.startsWith("3.3."))).toHaveLength(13);
    expect(expansion.filter((q) => q.topicId.startsWith("3.6."))).toHaveLength(13);
    for (const q of expansion) {
      expect(curriculum.topics.some((topic) => topic.id === q.topicId)).toBe(true);
      expect(q.origin).toBe("original");
      expect(q.demoId).toBe("");
      expect(new Set(q.options).size).toBe(4);
      expect(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4).toBe(
        true,
      );
    }
  });
  it("verifica independientemente las respuestas numéricas y algebraicas", () => {
    const expected: Record<number, string> = {
      1: "17/12 L",
      2: `$${480 * (1 - 0.15)}`,
      3: `x = ${(28 + 7) / 5}`,
      4: String((11 - 3) / 2),
      5: "4 y 5",
      6: "(x − 5)(x + 5)",
      7: `${Math.hypot(9, 12)} cm`,
      8: `${2 * 7}π cm`,
      9: String((6 + 8 + 8 + 9 + 9) / 5),
      10: "3/8",
      11: String((6 * 5) / 2),
      12: `$${2400 * 0.1 * 0.5}`,
      13: String((11 - 3) / (6 - 2)),
      14: String(2 * (-2) ** 2 - 3),
      15: `${(90 * 1000) / 3600} m/s`,
      16: `${360 / 30} m/s`,
      17: `${(16 - 4) / 6} m/s²`,
      18: `${0.5 * 3 * 4 ** 2} m`,
      19: `${18 / 6} m/s²`,
      20: `${8 * 9.8} N`,
      21: `${0.5 * 2 * 5 ** 2} J`,
      22: `${12 * 4} J`,
      23: `${900 / 30} W`,
      24: `${200 / 0.5} Pa`,
      25: `${150 / 50} g/cm³`,
      26: `${12 / 6} A`,
      28: "11",
      29: String(35 - 17),
      33: `${2 * 3} mol`,
      34: `${88 / 44} mol`,
      35: `${0.5 * 6.022} × 10²³`,
      36: `${Number((0.3 / 1.5).toFixed(4))} mol/L`,
      37: `${(2 * 100) / 400} mol/L`,
      38: `${(12 / (12 + 88)) * 100} %`,
      39: String(-Math.log10(1e-3)),
      40: "C₄H₁₀",
    };
    for (const [number, answer] of Object.entries(expected)) {
      const q = expansion[Number(number) - 1]!;
      expect(q.options[q.correctIndex], q.id).toBe(answer);
    }
    expect(4 ** 2 - 9 * 4 + 20).toBe(0);
    expect(5 ** 2 - 9 * 5 + 20).toBe(0);
  });
  it("configura 60 preguntas y un minuto por pregunta", () => {
    expect(SIMULATOR_QUESTION_COUNT).toBe(60);
    expect(SIMULATOR_TIME_LIMIT_SECONDS).toBe(3600);
  });
  it("solo acepta una suelta dentro del recuadro", () => {
    const rect = { left: 20, right: 200, top: 100, bottom: 180 };
    expect(isInsideDropZone(80, 130, rect)).toBe(true);
    expect(isInsideDropZone(20, 100, rect)).toBe(true);
    expect(isInsideDropZone(0, 130, rect)).toBe(false);
    expect(isInsideDropZone(80, 190, rect)).toBe(false);
  });
  it("ofrece controles accesibles y permite quitar una respuesta recuperada", () => {
    const html = renderToStaticMarkup(
      <SimulatorAnswerBoard
        questionId="q1"
        answers={[
          { id: "a1", text: "Opción uno" },
          { id: "a2", text: "Opción dos" },
        ]}
        selectedId="a2"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Tab y Enter");
    expect(html).toContain("Quitar");
    expect(html).toContain("Tu respuesta");
  });
  it("mantiene el formulario plegado, sin respuestas ni soluciones", () => {
    const html = renderToStaticMarkup(<SimulatorFormulaSheet />);
    expect(formulaSheet.map((section) => section.subject)).toEqual([
      "Matemáticas",
      "Física",
      "Química",
    ]);
    expect(html).toContain("<details");
    expect(html).not.toContain(" open=");
    expect(html).toContain("no pausa el cronómetro");
    expect(html).not.toMatch(/isCorrect|correctIndex|uaq26-sim/);
    for (const q of expansion) expect(html).not.toContain(q.text);
  });
});
