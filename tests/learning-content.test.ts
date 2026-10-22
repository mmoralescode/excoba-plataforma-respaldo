import { describe, expect, it } from "vitest";
import { curriculum, questions } from "../src/content/bank";
import { careers } from "../src/content/career-catalog";
import { fullExamSubjects, selectFullExam } from "../src/server/use-cases/simulator-blueprint";
import {
  gradeStructured,
  structuredPrompt,
  StructuredResponseSchema,
} from "../src/server/use-cases/structured-responses";
import { responseComplete } from "../src/content/interaction-types";

describe("Cobertura y estructura completa", () => {
  it("cubre los 209 temas y mantiene 25 preguntas como mínimo por asignatura", () => {
    expect(new Set(questions.map((q) => q.topicId))).toEqual(
      new Set(curriculum.topics.map((t) => t.id)),
    );
    for (const s of curriculum.subjects)
      expect(
        questions.filter((q) => q.topicId.startsWith(s.id + ".")).length,
        s.name,
      ).toBeGreaterThanOrEqual(25);
  });
  it("asigna 40/80/60 y exactamente veinte por asignatura de cada carrera", () => {
    const candidates = questions.map((q) => ({
      ...q,
      subjectId: "uaq-2026-2-subject-" + q.topicId.split(".").slice(0, 2).join("."),
    }));
    for (const career of careers) {
      if (new Set(career.subjectIds).size !== 3) continue;
      const subjects = fullExamSubjects(career.id);
      const result = selectFullExam(candidates, subjects);
      expect(result).toHaveLength(180);
      expect(new Set(result.map((q) => q.id)).size).toBe(180);
      for (const s of subjects) expect(result.filter((q) => q.subjectId === s)).toHaveLength(20);
      expect(result.filter((q) => q.topicId.startsWith("1."))).toHaveLength(40);
      expect(result.filter((q) => q.topicId.startsWith("2."))).toHaveLength(80);
      expect(result.filter((q) => q.topicId.startsWith("3."))).toHaveLength(60);
    }
  });
  it("rechaza una carrera desconocida o una cuota insuficiente; no rellena con otra materia", () => {
    expect(() => fullExamSubjects("inventada")).toThrow("Selecciona");
    expect(() =>
      selectFullExam(
        Array.from({ length: 180 }, (_, i) => ({ id: String(i), subjectId: "other" })),
        ["uaq-2026-2-subject-1.1"],
      ),
    ).toThrow("quedan 0");
  });
});

describe("Calificación semiconstruida exclusivamente en servidor", () => {
  it.each(["0.5", "0,5", "1/2", "2/4", " .5 "])(
    "acepta el valor numérico equivalente %s",
    (text) => {
      expect(gradeStructured("uaq26-interactive-v4-06", { text })).toBe(1);
    },
  );
  it.each(["1/0", "Infinity", "NaN", "1e9999", "0.5abc", "process.exit()", ""])(
    "rechaza entradas numéricas inválidas %s",
    (text) => {
      expect(gradeStructured("uaq26-interactive-v4-06", { text })).toBe(0);
    },
  );
  it.each(["5x-4", "-4+5x", "3x+2x-4", "5*x − 4"])(
    "acepta álgebra lineal equivalente %s sin eval",
    (text) => {
      expect(gradeStructured("uaq26-interactive-v4-07", { text })).toBe(1);
    },
  );
  it.each(["5x+4", "5x-4+globalThis", "x^2", "5x--4", "5x4", "5(x)-4"])(
    "rechaza álgebra incorrecta o fuera de gramática %s",
    (text) => {
      expect(gradeStructured("uaq26-interactive-v4-07", { text })).toBe(0);
    },
  );
  it("otorga crédito parcial por cada clasificación correcta", () => {
    expect(
      gradeStructured("uaq26-interactive-v4-03", {
        placements: { a: "n", b: "j", c: "p", d: "w" },
      }),
    ).toBe(0.5);
    expect(
      gradeStructured("uaq26-interactive-v4-03", {
        placements: { a: "n", b: "j", c: "w", d: "p" },
      }),
    ).toBe(1);
    expect(gradeStructured("uaq26-interactive-v4-03", {})).toBe(0);
  });
  it("selección múltiple no permite obtener crédito marcándolo todo ni duplicando aciertos", () => {
    expect(gradeStructured("uaq26-interactive-v4-08", { selected: ["a", "b"] })).toBe(1);
    expect(gradeStructured("uaq26-interactive-v4-08", { selected: ["a", "c"] })).toBe(0.5);
    expect(gradeStructured("uaq26-interactive-v4-08", { selected: ["a", "a"] })).toBe(0);
    expect(gradeStructured("uaq26-interactive-v4-08", { selected: ["a", "b", "c", "d"] })).toBe(0);
  });
  it("califica la región del esquema y no filtra claves en la definición pública", () => {
    expect(gradeStructured("uaq26-interactive-v4-04", { text: "c" })).toBe(1);
    expect(gradeStructured("uaq26-interactive-v4-04", { text: "a" })).toBe(0);
    for (let i = 1; i <= 8; i++) {
      const prompt = structuredPrompt("uaq26-interactive-v4-" + String(i).padStart(2, "0"));
      expect(prompt).toBeDefined();
      expect(JSON.stringify(prompt)).not.toMatch(/expected|correctIndex|isCorrect|explanation/);
    }
  });
  it("limita tamaño y estructura del payload", () => {
    expect(StructuredResponseSchema.safeParse({ text: "a".repeat(121) }).success).toBe(false);
    expect(StructuredResponseSchema.safeParse({ credit: 1 }).success).toBe(false);
    expect(
      StructuredResponseSchema.safeParse({
        placements: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [String(i), "x"])),
      }).success,
    ).toBe(false);
  });
  it("no cuenta una clasificación incompleta como pregunta terminada", () => {
    const prompt = structuredPrompt("uaq26-interactive-v4-01")!;
    expect(responseComplete(prompt, { placements: { a: "1810" } })).toBe(false);
    expect(responseComplete(prompt, { placements: { a: "1810", b: "1910", c: "1914" } })).toBe(
      true,
    );
  });
});
