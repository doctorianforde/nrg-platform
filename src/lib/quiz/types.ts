export type QuizOption = {
  id: string;
  body: string;
  is_correct: boolean;
  rationale: string | null;
  display_order: number;
};

export type QuizQuestion = {
  id: string;
  body: string;
  cognitive_level: string | null;
  difficulty: string | null;
  question_type: string; // "mcq" | "sata"
  explanation: string | null;
  domainName?: string | null;
  topicName?: string | null;
  options: QuizOption[];
};
