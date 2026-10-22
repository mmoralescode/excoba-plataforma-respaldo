import curriculum from "./curriculum.json";
import { careers, getCareer, type Career } from "./career-catalog";
import { isCareerSubject, isCommonSubject, topicTitle } from "./subject-rules";

export { careers, getCareer, isCareerSubject, isCommonSubject, topicTitle };
export type { Career };
export const officialSubjects = curriculum.subjects;
export const officialTopics = curriculum.topics;
export type ContentScope = "official" | "extra";
export const CONTENT_PREFIX = "uaq-2026-2"; // Preserve existing database IDs and history.

export const subjectDbId = (id: string) => `${CONTENT_PREFIX}-subject-${id}`;
export const topicDbId = (id: string) => `${CONTENT_PREFIX}-topic-${id}`;
export const officialTopicIds = officialTopics.map((topic) => topicDbId(topic.id));
const topicMap = new Map(officialTopics.map((topic) => [topicDbId(topic.id), topic]));
export function officialTopic(topicId: string) {
  return topicMap.get(topicId);
}
/** Primary and secondary education are assessed for every undergraduate program. */
export function careerTopicIds(career: Career) {
  return officialTopics
    .filter((topic) => isCareerSubject(topic.subjectId, career))
    .map((topic) => topicDbId(topic.id));
}

export function priorityForTopic(topicId: string, career: Career | null) {
  const topic = officialTopic(topicId);
  return !topic ? 2 : career?.subjectIds.includes(topic.subjectId) ? 0 : 1;
}
export function orderSubjects<T extends { id: string }>(items: T[], career: Career | null) {
  return [...items].sort(
    (a, b) =>
      Number(!career?.subjectIds.includes(a.id)) - Number(!career?.subjectIds.includes(b.id)),
  );
}
export function completion(total: number, answered: number) {
  return total > 0 ? Math.min(100, Math.round((answered / total) * 100)) : 0;
}

/** Shuffle before passing here. Stable tiers preserve randomness within each tier;
 * unseen questions come first within a tier so repeated sessions cover more topics. */
export function prioritizeQuestions<T extends { id: string; topicId: string }>(
  items: T[],
  career: Career,
  answeredIds: ReadonlySet<string> = new Set(),
) {
  return [...items].sort(
    (a, b) =>
      priorityForTopic(a.topicId, career) - priorityForTopic(b.topicId, career) ||
      Number(answeredIds.has(a.id)) - Number(answeredIds.has(b.id)),
  );
}

/** Visit unseen topics before repeating an exhausted tier. Keep the career-first
 * order inside the chosen session, without starving common or optional areas. */
export function selectPracticeQuestions<T extends { id: string; topicId: string }>(
  items: T[],
  career: Career,
  answeredIds: ReadonlySet<string>,
  count: number,
) {
  const ordered = prioritizeQuestions(items, career, answeredIds);
  const selected = [
    ...ordered.filter((question) => !answeredIds.has(question.id)),
    ...ordered.filter((question) => answeredIds.has(question.id)),
  ].slice(0, count);
  return prioritizeQuestions(selected, career, answeredIds);
}
