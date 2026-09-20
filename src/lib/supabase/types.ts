// Generated from nrg-platform-prod via the Supabase MCP connector (2026-09-18).
// Hand-maintained since: questions.review_* (20260919010000) and the messaging tables
// (20260919020000). `supabase gen types` needs Docker, which isn't set up on this machine.
// Regenerate after every migration (questions review_* columns added by hand for 20260919010000): npx supabase gen types typescript --project-id cdvubijjepwmhhkgppbl > src/lib/supabase/types.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_contacts: {
        Row: { created_at: string; email: string; note: string | null }
        Insert: { created_at?: string; email: string; note?: string | null }
        Update: { created_at?: string; email?: string; note?: string | null }
        Relationships: []
      }
      role_requests: {
        Row: { created_at: string; decided_at: string | null; decided_by: string | null; id: string; note: string | null; requested_role: string; status: string; user_id: string }
        Insert: { created_at?: string; decided_at?: string | null; decided_by?: string | null; id?: string; note?: string | null; requested_role: string; status?: string; user_id: string }
        Update: { created_at?: string; decided_at?: string | null; decided_by?: string | null; id?: string; note?: string | null; requested_role?: string; status?: string; user_id?: string }
        Relationships: []
      }
      calendar_events: {
        Row: { audience: string; created_at: string; created_by: string; description: string | null; end_time: string | null; event_date: string; id: string; start_time: string | null; title: string; updated_at: string }
        Insert: { audience?: string; created_at?: string; created_by: string; description?: string | null; end_time?: string | null; event_date: string; id?: string; start_time?: string | null; title: string; updated_at?: string }
        Update: { audience?: string; created_at?: string; created_by?: string; description?: string | null; end_time?: string | null; event_date?: string; id?: string; start_time?: string | null; title?: string; updated_at?: string }
        Relationships: []
      }
      calendar_event_audience: {
        Row: { event_id: string; user_id: string }
        Insert: { event_id: string; user_id: string }
        Update: { event_id?: string; user_id?: string }
        Relationships: [{ foreignKeyName: "calendar_event_audience_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "calendar_events"; referencedColumns: ["id"] }]
      }
      xp_events: {
        Row: { amount: number; created_at: string; id: string; reason: string; source_id: string | null; user_id: string }
        Insert: { amount: number; created_at?: string; id?: string; reason: string; source_id?: string | null; user_id: string }
        Update: { amount?: number; created_at?: string; id?: string; reason?: string; source_id?: string | null; user_id?: string }
        Relationships: []
      }
      practice_sessions: {
        Row: { correct_count: number; domain_id: number | null; finished_at: string; id: string; student_id: string; total_answered: number }
        Insert: { correct_count: number; domain_id?: number | null; finished_at?: string; id?: string; student_id: string; total_answered: number }
        Update: { correct_count?: number; domain_id?: number | null; finished_at?: string; id?: string; student_id?: string; total_answered?: number }
        Relationships: [{ foreignKeyName: "practice_sessions_domain_id_fkey"; columns: ["domain_id"]; isOneToOne: false; referencedRelation: "domains"; referencedColumns: ["id"] }]
      }
      case_studies: {
        Row: { clinical_scenario: string; created_at: string; domain_id: number | null; id: string; is_active: boolean }
        Insert: { clinical_scenario: string; created_at?: string; domain_id?: number | null; id?: string; is_active?: boolean }
        Update: { clinical_scenario?: string; created_at?: string; domain_id?: number | null; id?: string; is_active?: boolean }
        Relationships: [{ foreignKeyName: "case_studies_domain_id_fkey"; columns: ["domain_id"]; isOneToOne: false; referencedRelation: "domains"; referencedColumns: ["id"] }]
      }
      case_study_questions: {
        Row: { case_study_id: string; display_order: number; question_id: string }
        Insert: { case_study_id: string; display_order?: number; question_id: string }
        Update: { case_study_id?: string; display_order?: number; question_id?: string }
        Relationships: [
          { foreignKeyName: "case_study_questions_case_study_id_fkey"; columns: ["case_study_id"]; isOneToOne: false; referencedRelation: "case_studies"; referencedColumns: ["id"] },
          { foreignKeyName: "case_study_questions_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "questions"; referencedColumns: ["id"] },
        ]
      }
      domains: {
        Row: { code: string; display_order: number | null; exam_weight_pct: number | null; id: number; name: string }
        Insert: { code: string; display_order?: number | null; exam_weight_pct?: number | null; id?: number; name: string }
        Update: { code?: string; display_order?: number | null; exam_weight_pct?: number | null; id?: number; name?: string }
        Relationships: []
      }
      flashcards: {
        Row: { back: string; created_at: string; front: string; id: string; is_active: boolean; topic_id: number | null }
        Insert: { back: string; created_at?: string; front: string; id?: string; is_active?: boolean; topic_id?: number | null }
        Update: { back?: string; created_at?: string; front?: string; id?: string; is_active?: boolean; topic_id?: number | null }
        Relationships: [{ foreignKeyName: "flashcards_topic_id_fkey"; columns: ["topic_id"]; isOneToOne: false; referencedRelation: "topics"; referencedColumns: ["id"] }]
      }
      message_threads: {
        Row: { created_at: string; id: string; last_message_at: string; session_id: string | null; staff_last_read_at: string | null; status: string; student_id: string; student_last_read_at: string | null; subject: string }
        Insert: { created_at?: string; id?: string; last_message_at?: string; session_id?: string | null; staff_last_read_at?: string | null; status?: string; student_id: string; student_last_read_at?: string | null; subject: string }
        Update: { created_at?: string; id?: string; last_message_at?: string; session_id?: string | null; staff_last_read_at?: string | null; status?: string; student_id?: string; student_last_read_at?: string | null; subject?: string }
        Relationships: [{ foreignKeyName: "message_threads_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "mock_exam_sessions"; referencedColumns: ["id"] }]
      }
      messages: {
        Row: { author_id: string; body: string; created_at: string; id: string; thread_id: string }
        Insert: { author_id: string; body: string; created_at?: string; id?: string; thread_id: string }
        Update: { author_id?: string; body?: string; created_at?: string; id?: string; thread_id?: string }
        Relationships: [{ foreignKeyName: "messages_thread_id_fkey"; columns: ["thread_id"]; isOneToOne: false; referencedRelation: "message_threads"; referencedColumns: ["id"] }]
      }
      migration_log: {
        Row: { created_at: string; id: number; message: string | null; run_id: string; source_id: string | null; status: string }
        Insert: { created_at?: string; id?: number; message?: string | null; run_id: string; source_id?: string | null; status: string }
        Update: { created_at?: string; id?: number; message?: string | null; run_id?: string; source_id?: string | null; status?: string }
        Relationships: []
      }
      mock_exam_responses: {
        Row: { answered_at: string; id: string; is_correct: boolean | null; question_id: string; selected_option_ids: string[]; session_id: string }
        Insert: { answered_at?: string; id?: string; is_correct?: boolean | null; question_id: string; selected_option_ids?: string[]; session_id: string }
        Update: { answered_at?: string; id?: string; is_correct?: boolean | null; question_id?: string; selected_option_ids?: string[]; session_id?: string }
        Relationships: [
          { foreignKeyName: "mock_exam_responses_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "questions"; referencedColumns: ["id"] },
          { foreignKeyName: "mock_exam_responses_session_id_fkey"; columns: ["session_id"]; isOneToOne: false; referencedRelation: "mock_exam_sessions"; referencedColumns: ["id"] },
        ]
      }
      mock_exam_sessions: {
        Row: { completed_at: string | null; correct_count: number | null; id: string; score_pct: number | null; set_id: string; started_at: string; student_id: string; total_questions: number | null }
        Insert: { completed_at?: string | null; correct_count?: number | null; id?: string; score_pct?: number | null; set_id: string; started_at?: string; student_id: string; total_questions?: number | null }
        Update: { completed_at?: string | null; correct_count?: number | null; id?: string; score_pct?: number | null; set_id?: string; started_at?: string; student_id?: string; total_questions?: number | null }
        Relationships: [{ foreignKeyName: "mock_exam_sessions_set_id_fkey"; columns: ["set_id"]; isOneToOne: false; referencedRelation: "mock_exam_sets"; referencedColumns: ["id"] }]
      }
      mock_exam_set_questions: {
        Row: { display_order: number; question_id: string; set_id: string }
        Insert: { display_order?: number; question_id: string; set_id: string }
        Update: { display_order?: number; question_id?: string; set_id?: string }
        Relationships: [
          { foreignKeyName: "mock_exam_set_questions_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "questions"; referencedColumns: ["id"] },
          { foreignKeyName: "mock_exam_set_questions_set_id_fkey"; columns: ["set_id"]; isOneToOne: false; referencedRelation: "mock_exam_sets"; referencedColumns: ["id"] },
        ]
      }
      mock_exam_sets: {
        Row: { created_at: string; created_by: string; description: string | null; id: string; is_active: boolean; rationale_released_at: string | null; rationale_released_by: string | null; title: string; updated_at: string }
        Insert: { created_at?: string; created_by: string; description?: string | null; id?: string; is_active?: boolean; rationale_released_at?: string | null; rationale_released_by?: string | null; title: string; updated_at?: string }
        Update: { created_at?: string; created_by?: string; description?: string | null; id?: string; is_active?: boolean; rationale_released_at?: string | null; rationale_released_by?: string | null; title?: string; updated_at?: string }
        Relationships: []
      }
      profiles: {
        Row: { avatar_url: string | null; created_at: string; full_name: string | null; id: string; role: string; subscription_tier: string; suspended_at: string | null; updated_at: string }
        Insert: { avatar_url?: string | null; created_at?: string; full_name?: string | null; id: string; role?: string; subscription_tier?: string; suspended_at?: string | null; updated_at?: string }
        Update: { avatar_url?: string | null; created_at?: string; full_name?: string | null; id?: string; role?: string; subscription_tier?: string; suspended_at?: string | null; updated_at?: string }
        Relationships: []
      }
      question_options: {
        Row: { body: string; display_order: number; id: string; is_correct: boolean; question_id: string; rationale: string | null }
        Insert: { body: string; display_order: number; id?: string; is_correct: boolean; question_id: string; rationale?: string | null }
        Update: { body?: string; display_order?: number; id?: string; is_correct?: boolean; question_id?: string; rationale?: string | null }
        Relationships: [{ foreignKeyName: "question_options_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "questions"; referencedColumns: ["id"] }]
      }
      question_tags: {
        Row: { question_id: string; tag_id: number }
        Insert: { question_id: string; tag_id: number }
        Update: { question_id?: string; tag_id?: number }
        Relationships: [
          { foreignKeyName: "question_tags_question_id_fkey"; columns: ["question_id"]; isOneToOne: false; referencedRelation: "questions"; referencedColumns: ["id"] },
          { foreignKeyName: "question_tags_tag_id_fkey"; columns: ["tag_id"]; isOneToOne: false; referencedRelation: "tags"; referencedColumns: ["id"] },
        ]
      }
      questions: {
        Row: { body: string; cognitive_level: string | null; created_at: string; created_by: string | null; difficulty: string | null; domain_id: number; explanation: string | null; fts: unknown; id: string; is_active: boolean; is_ai_generated: boolean; question_type: string; review_notes: string | null; review_status: string; reviewed_at: string | null; reviewed_by: string | null; source: string | null; source_id: string | null; topic_id: number | null; updated_at: string }
        Insert: { body: string; cognitive_level?: string | null; created_at?: string; created_by?: string | null; difficulty?: string | null; domain_id: number; explanation?: string | null; fts?: unknown; id?: string; is_active?: boolean; is_ai_generated?: boolean; question_type?: string; review_notes?: string | null; review_status?: string; reviewed_at?: string | null; reviewed_by?: string | null; source?: string | null; source_id?: string | null; topic_id?: number | null; updated_at?: string }
        Update: { body?: string; cognitive_level?: string | null; created_at?: string; created_by?: string | null; difficulty?: string | null; domain_id?: number; explanation?: string | null; fts?: unknown; id?: string; is_active?: boolean; is_ai_generated?: boolean; question_type?: string; review_notes?: string | null; review_status?: string; reviewed_at?: string | null; reviewed_by?: string | null; source?: string | null; source_id?: string | null; topic_id?: number | null; updated_at?: string }
        Relationships: [
          { foreignKeyName: "questions_domain_id_fkey"; columns: ["domain_id"]; isOneToOne: false; referencedRelation: "domains"; referencedColumns: ["id"] },
          { foreignKeyName: "questions_topic_id_fkey"; columns: ["topic_id"]; isOneToOne: false; referencedRelation: "topics"; referencedColumns: ["id"] },
        ]
      }
      tags: {
        Row: { id: number; name: string }
        Insert: { id?: number; name: string }
        Update: { id?: number; name?: string }
        Relationships: []
      }
      topic_clusters: {
        Row: { code: string; display_order: number | null; id: number; name: string; share_pct: number | null }
        Insert: { code: string; display_order?: number | null; id?: number; name: string; share_pct?: number | null }
        Update: { code?: string; display_order?: number | null; id?: number; name?: string; share_pct?: number | null }
        Relationships: []
      }
      topics: {
        Row: { cluster_id: number | null; domain_id: number | null; id: number; is_active: boolean; name: string; slug: string | null }
        Insert: { cluster_id?: number | null; domain_id?: number | null; id?: number; is_active?: boolean; name: string; slug?: string | null }
        Update: { cluster_id?: number | null; domain_id?: number | null; id?: number; is_active?: boolean; name?: string; slug?: string | null }
        Relationships: [
          { foreignKeyName: "topics_cluster_id_fkey"; columns: ["cluster_id"]; isOneToOne: false; referencedRelation: "topic_clusters"; referencedColumns: ["id"] },
          { foreignKeyName: "topics_domain_id_fkey"; columns: ["domain_id"]; isOneToOne: false; referencedRelation: "domains"; referencedColumns: ["id"] },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      can_manage_question: { Args: { q_id: string }; Returns: boolean }
      complete_mock_exam_session: {
        Args: { p_session_id: string }
        Returns: { completed_at: string | null; correct_count: number | null; id: string; score_pct: number | null; set_id: string; started_at: string; student_id: string; total_questions: number | null }
      }
      is_admin: { Args: never; Returns: boolean }
      search_mock_exam_questions: {
        Args: { p_query: string; p_student_id: string }
        Returns: { body: string; completed_at: string; is_correct: boolean; question_id: string; rank: number; session_id: string; set_title: string }[]
      }
      decide_role_request: {
        Args: { p_request_id: string; p_approve: boolean; p_note?: string }
        Returns: { created_at: string; decided_at: string | null; decided_by: string | null; id: string; note: string | null; requested_role: string; status: string; user_id: string }
      }
      mark_thread_read: { Args: { p_thread_id: string }; Returns: undefined }
      record_practice_session: {
        Args: { p_total: number; p_correct: number; p_domain?: number }
        Returns: { correct_count: number; domain_id: number | null; finished_at: string; id: string; student_id: string; total_answered: number }
      }
      study_streak: { Args: { p_user: string }; Returns: number }
      xp_total: { Args: { p_user: string }; Returns: number }
      user_role: { Args: never; Returns: string }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"]
export type Functions<T extends keyof DefaultSchema["Functions"]> = DefaultSchema["Functions"][T]
