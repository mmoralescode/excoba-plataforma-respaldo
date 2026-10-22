export type ReviewItem = {
  questionId: string;
  text: string;
  topicName: string;
  subjectId: string;
  topicId: string;
  selectedText: string;
  correctText: string;
  explanation: string;
  isCorrect: boolean;
  credit: number;
};
export type AttemptReview = {
  attemptId: string;
  score: number;
  correctCount: number;
  totalCount: number;
  review: ReviewItem[];
};
