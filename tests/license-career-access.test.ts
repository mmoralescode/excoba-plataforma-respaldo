import { describe, expect, it } from "vitest";
import { careers } from "@/content/career-catalog";
import { subjectDbId, topicDbId } from "@/content/study-plan";
import {
  ALL_CAREER_ACCESS, type LicenseAccess, getLicenseAccess, assertCareerAccess,
  allowedCareerSubjectIds, allowedCareerTopicIds, assertQuestionAccess, assertAttemptCareerAccess,
} from "@/lib/license-career-access";
import { canAccessPlatform } from "@/lib/license-access";

const single: LicenseAccess = {
  ...ALL_CAREER_ACCESS, careerScope: "SINGLE_CAREER", validityMonths: 2,
  selectedCareerId: "uaq-2026-1-01",
};

describe("Alcance de planes y protección del temario", () => {
  it("proyecta solamente los campos públicos y serializa fechas", () => {
    const user = {
      roles: [{ role: { name: "ALUMNO" } }],
      license: { ...single, startsAt: new Date("2026-09-30T12:00:00Z"), codeHash: "secret" },
    };
    expect(getLicenseAccess(user)).toEqual({ ...single, startsAt: "2026-09-30T12:00:00.000Z" });
    expect(getLicenseAccess(user)).not.toHaveProperty("codeHash");
  });
  it("preserva al personal y licencias anteriores sin restricciones nuevas", () => {
    expect(getLicenseAccess({ roles: [{ role: { name: "SUPER_ADMIN" } }], license: single }))
      .toEqual(ALL_CAREER_ACCESS);
    expect(getLicenseAccess({ roles: [{ role: { name: "ALUMNO" } }], license: {} }))
      .toEqual(ALL_CAREER_ACCESS);
  });
  it("no confía en carreras inventadas ni permite contenido sin confirmar", () => {
    expect(() => assertCareerAccess(single, "inventada")).toThrow("válida");
    expect(() => assertCareerAccess({ ...single, selectedCareerId: null })).toThrow("Primero confirma");
    expect(allowedCareerSubjectIds({ ...single, selectedCareerId: null })).toEqual([]);
    expect(allowedCareerTopicIds({ ...single, selectedCareerId: null })).toEqual([]);
  });
  it("bloquea otra carrera incluso si comparte el mismo temario", () => {
    const other = careers.find((career) => career.id !== single.selectedCareerId)!;
    expect(() => assertCareerAccess(single, other.id)).toThrow("solo permite");
    expect(() => assertCareerAccess(single, single.selectedCareerId)).not.toThrow();
    expect(() => assertCareerAccess(ALL_CAREER_ACCESS, other.id)).not.toThrow();
  });
  it("incluye tronco común y excluye especialidades ajenas y temas extra", () => {
    const topics = allowedCareerTopicIds(single)!;
    expect(topics).toContain(topicDbId("1.1.1"));
    expect(topics).toContain(topicDbId("3.1.1.1"));
    expect(topics).not.toContain(topicDbId("3.2.1.1"));
    expect(allowedCareerSubjectIds(single)).toHaveLength(9);
    expect(() => assertQuestionAccess(single, [{ subjectId: subjectDbId("1.1"), topicId: "custom" }])).toThrow("no pertenece");
    expect(() => assertQuestionAccess(single, [{ subjectId: subjectDbId("1.1"), topicId: topicDbId("1.1.1") }])).not.toThrow();
    expect(() => assertQuestionAccess(single, [{ subjectId: "forged", topicId: topicDbId("1.1.1") }])).toThrow();
  });
  it("no reutiliza intentos antiguos sin carrera ni intentos de otra carrera", () => {
    expect(() => assertAttemptCareerAccess(single, null)).toThrow();
    expect(() => assertAttemptCareerAccess(single, {})).toThrow();
    expect(() => assertAttemptCareerAccess(single, { careerId: "uaq-2026-1-02" })).toThrow();
    expect(() => assertAttemptCareerAccess(single, { careerId: single.selectedCareerId })).not.toThrow();
    expect(() => assertAttemptCareerAccess(ALL_CAREER_ACCESS, null)).not.toThrow();
  });
  it("un código de seis meses tampoco puede mantener una sesión de alumno", () => {
    const user = {
      id: "student", status: "ACTIVO", deletedAt: null,
      roles: [{ role: { name: "ALUMNO" } }],
      license: { userId: "student", status: "ACTIVADA", startsAt: null, expiresAt: null, validityMonths: 6 },
    };
    expect(canAccessPlatform(user)).toBe(false);
    expect(canAccessPlatform({ ...user, license: { ...user.license, validityMonths: 4 } })).toBe(true);
  });
});
