import { describe, expect, it } from "vitest";
import {
  careers,
  getCareer,
  officialSubjects,
  officialTopics,
  orderSubjects,
  topicDbId,
  priorityForTopic,
  prioritizeQuestions,
  completion,
} from "../src/content/study-plan";
import provenance from "../src/content/career-sources.json";

describe("Ruta de estudio según los anexos oficiales UAQ", () => {
  it("incluye las 122 opciones, sin duplicados, con tres áreas de bachillerato válidas", () => {
    expect(careers).toHaveLength(122);
    expect(new Set(careers.map((c) => c.name)).size).toBe(122);
    expect(new Set(careers.map((c) => c.id)).size).toBe(122);
    const groups = new Map<string, number>();
    for (const career of careers) {
      expect(new Set(career.subjectIds).size).toBe(3);
      expect(
        career.subjectIds.every(
          (id) => id.startsWith("3.") && officialSubjects.some((s) => s.id === id),
        ),
      ).toBe(true);
      groups.set(career.subjectIds.join(","), (groups.get(career.subjectIds.join(",")) ?? 0) + 1);
    }
    expect(Object.fromEntries(groups)).toEqual({
      "3.1,3.4,3.6": 8,
      "3.3,3.4,3.6": 12,
      "3.2,3.3,3.6": 16,
      "3.2,3.3,3.5": 21,
      "3.1,3.5,3.8": 64,
      "3.1,3.7,3.5": 1,
    });
    expect(getCareer("invalid")).toBeNull();
  });
  it("respeta Medicina y los límites de celdas combinadas del PDF", () => {
    const areas = (name: string) => careers.find((c) => c.name === name)?.subjectIds;
    expect(areas("MEDICINA GENERAL (QUERÉTARO)")).toEqual(["3.1", "3.4", "3.6"]);
    expect(areas("TSU EN MANEJO DE ALIMENTOS Y CULTURA DEL VINO (QUERÉTARO)")).toEqual([
      "3.1",
      "3.4",
      "3.6",
    ]);
    expect(areas("BIOLOGÍA (QUERÉTARO)")).toEqual(["3.3", "3.4", "3.6"]);
    expect(getCareer("uaq-2026-1-12")!.subjectIds).toEqual(["3.2", "3.3", "3.6"]);
    expect(areas("QUÍMICO FARMACÉUTICO BIÓLOGO (QUERÉTARO)")).toEqual(["3.2", "3.3", "3.6"]);
    expect(areas("ANIMACIÓN DIGITAL Y MEDIOS INTERACTIVOS (QUERÉTARO)")).toEqual([
      "3.2",
      "3.3",
      "3.5",
    ]);
  });
  it("no confunde cálculo, estadística ni matemáticas de otros niveles", () => {
    const medicine = careers[0]!;
    expect(
      orderSubjects(officialSubjects, medicine)
        .slice(0, 3)
        .map((s) => s.id),
    ).toEqual(["3.1", "3.4", "3.6"]);
    const topic = (subjectId: string) =>
      topicDbId(officialTopics.find((t) => t.subjectId === subjectId)!.id);
    expect(priorityForTopic(topic("3.1"), medicine)).toBe(0);
    expect(priorityForTopic(topic("3.2"), medicine)).toBe(1);
    expect(priorityForTopic(topic("1.2"), medicine)).toBe(1);
    expect(priorityForTopic("custom-matematicas", medicine)).toBe(2);
  });
  it("conserva los 49 IDs antiguos y documenta cada mapeo sin inventar materias", () => {
    for (let i = 1; i <= 49; i++) {
      expect(getCareer(`uaq-2026-1-${String(i).padStart(2, "0")}`)).not.toBeNull();
    }
    const metadata = provenance.careers as Record<
      string,
      {
        sourceId: string;
        page: number;
        row: number;
        groupId: string;
        sourceName: string;
        aliases: string[];
      }
    >;
    const groups = provenance.groups as Record<string, { subjectIds: string[] }>;
    expect(Object.keys(metadata).sort()).toEqual(careers.map((c) => c.id).sort());
    for (const career of careers) {
      const source = metadata[career.id]!;
      expect(provenance.sources).toHaveProperty(source.sourceId);
      expect(source.page).toBeGreaterThanOrEqual(17);
      expect(source.row).toBeGreaterThan(0);
      expect(source.sourceName.length).toBeGreaterThan(0);
      expect(career.subjectIds).toEqual(groups[source.groupId]!.subjectIds);
    }
    const counts = Object.values(metadata).reduce(
      (acc, s) => ({ ...acc, [s.sourceId]: (acc[s.sourceId] ?? 0) + 1 }),
      {} as Record<string, number>,
    );
    expect(counts).toEqual({ "uaq-2026-2": 118, "uaq-2026-1": 2, "uaq-2025-2": 2 });
    expect(metadata["uaq-2026-1-02"]!.aliases).toContain("ODONTOLOGÍA (QUERÉTARO)");
  });
  it("coteja Actuaría y los dos programas de fuente anterior", () => {
    expect(getCareer("uaq-2026-2-020")!.subjectIds).toEqual(["3.2", "3.3", "3.6"]);
    expect(getCareer("uaq-2026-2-118")!.subjectIds).toEqual(["3.1", "3.7", "3.5"]);
    expect(getCareer("uaq-2025-2-construccion-sostenible-pinal-de-amoles")!.subjectIds).toEqual([
      "3.2",
      "3.3",
      "3.5",
    ]);
    expect(getCareer("uaq-2025-2-realizacion-cinematografica")!.subjectIds).toEqual([
      "3.1",
      "3.5",
      "3.8",
    ]);
  });
  it("ordena prioridad oficial, resto oficial y extras sin perder preguntas; evita repetir dentro del nivel", () => {
    const medicine = careers[0]!;
    const items = [
      { id: "extra", topicId: "extra" },
      { id: "rest", topicId: topicDbId("1.1.1") },
      { id: "seen", topicId: topicDbId("3.1.1.1") },
      { id: "new", topicId: topicDbId("3.1.1.1") },
    ];
    expect(prioritizeQuestions(items, medicine, new Set(["seen"])).map((q) => q.id)).toEqual([
      "new",
      "seen",
      "rest",
      "extra",
    ]);
    expect(items[0]!.id).toBe("extra");
    expect(completion(0, 0)).toBe(0);
    expect(completion(10, 3)).toBe(30);
    expect(completion(10, 20)).toBe(100);
  });
});
