import { describe, expect, it } from "vitest";
import {
  getRemainingSeconds,
  hasSameQuestionSet,
  parseSimulatorConfig,
} from "../src/server/use-cases/simulator-rules";

describe("Reglas del simulador", () => {
  it("acepta únicamente configuraciones completas", () => {
    expect(parseSimulatorConfig({ timeLimitSeconds: 120, questionIds: ["q1", "q2"] })).toEqual({
      timeLimitSeconds: 120,
      questionIds: ["q1", "q2"],
    });
    expect(parseSimulatorConfig({ timeLimitSeconds: 0, questionIds: ["q1"] })).toBeNull();
    expect(parseSimulatorConfig({ timeLimitSeconds: 120 })).toBeNull();
  });

  it("calcula el tiempo restante contra la hora del servidor", () => {
    const startedAt = new Date("2026-09-07T12:00:00.000Z");
    const config = { timeLimitSeconds: 120, questionIds: ["q1"] };
    expect(getRemainingSeconds(startedAt, config, startedAt.getTime() + 45_000)).toBe(75);
    expect(getRemainingSeconds(startedAt, config, startedAt.getTime() + 180_000)).toBe(0);
  });

  it("exige entregar exactamente las preguntas asignadas", () => {
    expect(hasSameQuestionSet(["q1", "q2", "q3"], ["q3", "q1", "q2"])).toBe(true);
    expect(hasSameQuestionSet(["q1", "q2"], ["q1"])).toBe(false);
    expect(hasSameQuestionSet(["q1", "q2"], ["q1", "q1"])).toBe(false);
    expect(hasSameQuestionSet(["q1", "q2"], ["q1", "q2", "q3"])).toBe(false);
  });
});