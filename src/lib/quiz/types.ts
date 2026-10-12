export type QuizOption = {
  id: string;
  body: string;
  /** Present only once the server has decided the student may see the key (after answering, or on a released review). */
  is_correct?: boolean;
  rationale?: string | null;
  display_order: number;
};

export type QuizQuestion = {
  id: string;
  body: string;
  cognitive_level: string | null;
  difficulty: string | null;
  question_type: string; // "mcq" | "sata"
  explanation?: string | null;
  domainName?: string | null;
  topicName?: string | null;
  options: QuizOption[];
};
