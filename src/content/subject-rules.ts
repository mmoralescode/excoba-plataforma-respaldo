import type { Career } from "./career-catalog";

const COMMON_SUBJECT_IDS = new Set(["1.1", "1.2", "2.1", "2.2", "2.3", "2.4"]);

export function isCommonSubject(subjectId: string) {
  return COMMON_SUBJECT_IDS.has(subjectId);
}

export function isCareerSubject(subjectId: string, career: Career) {
  return isCommonSubject(subjectId) || career.subjectIds.includes(subjectId);
}

export function topicTitle(name: string) {
  return name.split(". ")[0]!.replace(/\.$/, "");
}
