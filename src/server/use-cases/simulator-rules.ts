export interface SimulatorConfig {
  timeLimitSeconds: number;
  questionIds: string[];
}

export function parseSimulatorConfig(config: unknown): SimulatorConfig | null {
  if (!config || typeof config !== "object") return null;
  const value = config as { timeLimitSeconds?: unknown; questionIds?: unknown };
  if (
    typeof value.timeLimitSeconds !== "number" ||
    !Number.isInteger(value.timeLimitSeconds) ||
    value.timeLimitSeconds < 1 ||
    !Array.isArray(value.questionIds) ||
    value.questionIds.some((id) => typeof id !== "string")
  ) {
    return null;
  }
  return {
    timeLimitSeconds: value.timeLimitSeconds,
    questionIds: value.questionIds,
  };
}

export function getRemainingSeconds(
  startedAt: Date,
  config: SimulatorConfig,
  now = Date.now(),
): number {
  const elapsedSeconds = Math.floor((now - startedAt.getTime()) / 1000);
  return Math.max(0, config.timeLimitSeconds - elapsedSeconds);
}

export function hasSameQuestionSet(expectedIds: string[], submittedIds: string[]): boolean {
  if (new Set(expectedIds).size !== expectedIds.length) return false;
  if (new Set(submittedIds).size !== submittedIds.length) return false;
  if (expectedIds.length !== submittedIds.length) return false;
  const submitted = new Set(submittedIds);
  return expectedIds.every((id) => submitted.has(id));
}