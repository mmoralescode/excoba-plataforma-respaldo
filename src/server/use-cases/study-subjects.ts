import { db } from "@/db/client";
import {
  officialSubjects,
  officialTopics,
  officialTopicIds,
  subjectDbId,
  topicDbId,
  topicTitle,
  completion,
} from "@/content/study-plan";
import type { StudySubject } from "@/content/study-types";
import { ALL_CAREER_ACCESS, type LicenseAccess, allowedCareerSubjectIds, allowedCareerTopicIds } from "@/lib/license-career-access";

export async function getStudySubjects(userId: string, access: LicenseAccess = ALL_CAREER_ACCESS): Promise<StudySubject[]> {
  const allowedSubjects = allowedCareerSubjectIds(access);
  const allowedTopics = allowedCareerTopicIds(access);
  if (allowedSubjects?.length === 0) return [];
  const [subjects, answers] = await Promise.all([
    db.subject.findMany({
      ...(allowedSubjects !== null ? { where: { id: { in: allowedSubjects } } } : {}),
      orderBy: { order: "asc" },
      include: {
        topics: {
          ...(allowedTopics !== null ? { where: { id: { in: allowedTopics } } } : {}),
          orderBy: { order: "asc" },
          include: {
            _count: { select: { questions: { where: { status: "PUBLICADO", deletedAt: null } } } },
            lessons: {
              where: { status: "PUBLICADO", deletedAt: null },
              orderBy: { order: "asc" },
              select: { id: true, title: true, content: true },
            },
          },
        },
      },
    }),
    db.attemptAnswer.findMany({
      where: { attempt: { userId, status: "ENTREGADO" }, selectedAnswerId: { not: null } },
      distinct: ["questionId"],
      select: { question: { select: { topicId: true } } },
    }),
  ]);
  const answeredTopics = new Set(answers.map((answer) => answer.question.topicId));
  const topicMap = new Map(
    subjects.flatMap((subject) => subject.topics.map((topic) => [topic.id, topic] as const)),
  );
  const result: StudySubject[] = officialSubjects.map((subject) => {
    const topics = officialTopics
      .filter((topic) => topic.subjectId === subject.id)
      .map((topic) => {
        const record = topicMap.get(topicDbId(topic.id));
        return {
          id: topicDbId(topic.id),
          name: topicTitle(topic.name),
          answered: answeredTopics.has(topicDbId(topic.id)),
          questionCount: record?._count.questions ?? 0,
          lessons: record?.lessons ?? [],
        };
      });
    const answered = topics.filter((topic) => topic.answered).length;
    return {
      key: subject.id,
      id: subjectDbId(subject.id),
      officialId: subject.id,
      name: subject.name,
      scope: "official",
      topics,
      answered,
      percent: completion(topics.length, answered),
      questionCount: topics.reduce((sum, topic) => sum + topic.questionCount, 0),
    };
  });
  const officialIds = new Set(officialTopicIds);
  for (const subject of subjects) {
    const topics = subject.topics
      .filter(
        (topic) =>
          !officialIds.has(topic.id) && (topic._count.questions > 0 || topic.lessons.length > 0),
      )
      .map((topic) => ({
        id: topic.id,
        name: topic.name,
        answered: answeredTopics.has(topic.id),
        questionCount: topic._count.questions,
        lessons: topic.lessons,
      }));
    if (!topics.length) continue;
    const answered = topics.filter((topic) => topic.answered).length;
    result.push({
      key: "extra-" + subject.id,
      id: subject.id,
      officialId: null,
      name: subject.name,
      scope: "extra",
      topics,
      answered,
      percent: completion(topics.length, answered),
      questionCount: topics.reduce((sum, topic) => sum + topic.questionCount, 0),
    });
  }
  return allowedSubjects === null ? result : result.filter((subject) =>
    subject.scope === "official" && allowedSubjects.includes(subject.id));
}
