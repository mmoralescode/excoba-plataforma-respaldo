import type { ContentScope } from "./study-plan";
export type StudySubject = {
  key: string;
  id: string;
  officialId: string | null;
  name: string;
  scope: ContentScope;
  topics: {
    id: string;
    name: string;
    answered: boolean;
    questionCount: number;
    lessons: { id: string; title: string; content: string }[];
  }[];
  answered: number;
  percent: number;
  questionCount: number;
};
