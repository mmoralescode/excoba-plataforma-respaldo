import { describe, expect, it } from "vitest";
import { curriculum, questions } from "../src/content/bank";
import { subjectNames } from "../src/content/subject-catalog";
import baseQuestions from "../src/content/questions.json";
import expansion from "../src/content/simulator-expansion.json";
import coverage from "../src/content/coverage-expansion.json";
import interactive from "../src/content/interactive-expansion.json";
import reinforcement from "../src/content/reinforcement-expansion.json";
const filterQuestions = (subjectId = "", topicId = "") =>
  questions.filter(
    (q) =>
      (!subjectId || q.topicId.startsWith(subjectId + ".")) && (!topicId || q.topicId === topicId),
  );

describe("Banco académico UAQ 2026-2", () => {
  it("mantiene sincronizados los nombres de asignatura sin duplicar los temas en el cliente", () => {
    expect(subjectNames).toEqual(
      Object.fromEntries(curriculum.subjects.map((subject) => [subject.id, subject.name])),
    );
  });

  it("preserva el temario oficial y la evidencia parcial del demo", () => {
    expect(curriculum.topics).toHaveLength(209);
    expect(curriculum.subjects).toHaveLength(14);
    expect(curriculum.topics.filter((t) => t.demoIds.length)).toHaveLength(71);
    expect(new Set(baseQuestions.map((q) => q.topicId))).toEqual(
      new Set(curriculum.topics.filter((t) => t.demoIds.length).map((t) => t.id)),
    );
    expect(new Set(curriculum.topics.map((t) => t.id)).size).toBe(209);
    expect(curriculum.sha256).toBe(
      "3056ba510f67dc0d9899189ef80b22f4a28b5527066714ded412bae4c364bff9",
    );
  });
  it("cada ejercicio tiene opciones distintas, explicación y correspondencia documentada", () => {
    expect(questions.length).toBeGreaterThanOrEqual(100);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(new Set(questions.map((q) => q.text)).size).toBe(questions.length);
    const mapping = curriculum.demoMapping as Record<string, { apartados: string[] }>;
    for (const q of questions) {
      expect(curriculum.topics.some((t) => t.id === q.topicId)).toBe(true);
      if (q.demoId) expect(mapping[q.demoId]!.apartados).toContain(q.topicId);
      else
        expect(
          [...expansion, ...coverage, ...interactive, ...reinforcement].some(
            (added) => added.id === q.id,
          ),
        ).toBe(true);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.correctIndex]).toBeTruthy();
      expect(q.explanation.length).toBeGreaterThan(20);
      expect(q.text).not.toMatch(/pregunta de ejemplo|reemplazar/i);
    }
    for (const s of curriculum.subjects) expect(filterQuestions(s.id).length).toBeGreaterThan(0);
  });
  it("verifica por procedimientos independientes los 48 ejercicios parametrizados", () => {
    let count = 0;
    for (const q of questions) {
      if (!q.calculation) continue;
      count++;
      const { kind, inputs, answer } = q.calculation;
      const p = inputs as [number, number, number];
      let expected = 0;
      switch (kind) {
        case "volume":
          expected = Array.from({ length: p[2] }, () => p[0] * p[1]).reduce((a, b) => a + b, 0);
          break;
        case "stock":
          expected = p[0] * p[1] - p[2] * p[1];
          break;
        case "linearEquation":
          expect(p[0] * answer + p[1]).toBe(p[2]);
          expected = answer;
          break;
        case "linearFunction":
          expected = p[0] + p[0] + p[0] - 2;
          break;
        case "handshakes":
          for (let i = 1; i < p[0]; i++) expected += i;
          break;
        case "interest":
          expected = p[0] * (p[1] / 100 / 12) * p[2];
          break;
        case "quadratic":
          expected = (p[0] + 1) ** 2;
          break;
        case "moles":
          expect(answer * p[1]).toBe(p[0]);
          expected = answer;
          break;
        default:
          throw new Error(`Cálculo sin verificación: ${kind}`);
      }
      expect(answer).toBeCloseTo(expected, 8);
      const rendered = q.options[q.correctIndex]!.replace(/[^\d.-]/g, "");
      // cm³ uses a superscript, which is excluded by the numeric parser.
      expect(Number(rendered)).toBe(answer);
    }
    expect(count).toBe(48);
  });
  it("filtra por materia y tema sin mezclar niveles", () => {
    expect(filterQuestions("1.1").every((q) => q.topicId.startsWith("1.1."))).toBe(true);
    expect(filterQuestions("1.1", "3.6.2.1")).toHaveLength(0);
    expect(filterQuestions("", "3.6.2.1")).toHaveLength(8);
    expect(filterQuestions("unknown")).toHaveLength(0);
  });
});
