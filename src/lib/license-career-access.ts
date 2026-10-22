import { getCareer } from "@/content/career-catalog";
import { careerTopicIds, isCareerSubject, officialSubjects, subjectDbId } from "@/content/study-plan";

export type LicenseAccess = {
  validityMonths: number | null;
  careerScope: "ALL_CAREERS" | "SINGLE_CAREER";
  selectedCareerId: string | null;
  careerSelectedAt: string | null;
  startsAt: string | null;
  expiresAt: string | null;
};

type AccessUser = {
  roles: { role: { name: string } }[];
  license?: {
    validityMonths?: number | null;
    careerScope?: string;
    selectedCareerId?: string | null;
    careerSelectedAt?: Date | string | null;
    startsAt?: Date | string | null;
    expiresAt?: Date | string | null;
  } | null;
};

const STAFF_ROLES = new Set(["SUPER_ADMIN", "EDITOR_ACADEMICO", "SOPORTE", "ANALISTA"]);
export const ALL_CAREER_ACCESS: LicenseAccess = {
  validityMonths: null, careerScope: "ALL_CAREERS", selectedCareerId: null,
  careerSelectedAt: null, startsAt: null, expiresAt: null,
};
const iso = (date: Date | string | null | undefined) => date ? new Date(date).toISOString() : null;

/** JSON-safe projection. Only server-authenticated users may provide this data. */
export function getLicenseAccess(user: AccessUser): LicenseAccess {
  if (user.roles.some(({ role }) => STAFF_ROLES.has(role.name))) return { ...ALL_CAREER_ACCESS };
  const license = user.license;
  return {
    validityMonths: license?.validityMonths ?? null,
    careerScope: license?.careerScope === "SINGLE_CAREER" ? "SINGLE_CAREER" : "ALL_CAREERS",
    selectedCareerId: license?.selectedCareerId ?? null,
    careerSelectedAt: iso(license?.careerSelectedAt),
    startsAt: iso(license?.startsAt),
    expiresAt: iso(license?.expiresAt),
  };
}

export class CareerAccessError extends Error {
  constructor(message: string, public readonly status = 403) {
    super(message);
    this.name = "CareerAccessError";
  }
}

export function assertCareerAccess(access: LicenseAccess, requestedCareerId?: string | null) {
  if (requestedCareerId && !getCareer(requestedCareerId))
    throw new CareerAccessError("Selecciona una carrera válida del catálogo.", 400);
  if (access.careerScope !== "SINGLE_CAREER") return;
  if (!getCareer(access.selectedCareerId))
    throw new CareerAccessError("Primero confirma tu única carrera en Mi acceso.");
  if (requestedCareerId && requestedCareerId !== access.selectedCareerId)
    throw new CareerAccessError("Tu plan de dos meses solo permite la carrera que seleccionaste.");
}

export function allowedCareerSubjectIds(access: LicenseAccess): string[] | null {
  if (access.careerScope !== "SINGLE_CAREER") return null;
  const career = getCareer(access.selectedCareerId);
  return career ? officialSubjects.filter((subject) => isCareerSubject(subject.id, career))
    .map((subject) => subjectDbId(subject.id)) : [];
}

export function allowedCareerTopicIds(access: LicenseAccess): string[] | null {
  if (access.careerScope !== "SINGLE_CAREER") return null;
  const career = getCareer(access.selectedCareerId);
  return career ? careerTopicIds(career) : [];
}

/** Checks both subjects and topics: an extra topic in a common subject is not included. */
export function assertQuestionAccess(
  access: LicenseAccess,
  questions: { subjectId?: string; topicId: string }[],
) {
  if (access.careerScope !== "SINGLE_CAREER") return;
  assertCareerAccess(access);
  const topics = new Set(allowedCareerTopicIds(access)!);
  const subjects = new Set(allowedCareerSubjectIds(access)!);
  if (questions.some((question) => !topics.has(question.topicId) ||
    (question.subjectId !== undefined && !subjects.has(question.subjectId))))
    throw new CareerAccessError("Este contenido no pertenece a la carrera incluida en tu plan.");
}

export function assertAttemptCareerAccess(access: LicenseAccess, config: unknown) {
  if (access.careerScope !== "SINGLE_CAREER") return;
  const careerId = config && typeof config === "object" && "careerId" in config
    ? (config as { careerId?: unknown }).careerId : null;
  // Old attempts without a declared career cannot be used to recover unrelated material.
  if (typeof careerId !== "string")
    throw new CareerAccessError("Este intento no corresponde a la carrera incluida en tu plan.");
  assertCareerAccess(access, careerId);
}
