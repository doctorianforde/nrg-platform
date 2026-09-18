// Generated from nrg-platform-prod via the Supabase MCP connector (2026-09-18).
// Regenerate after every migration: npx supabase gen types typescript --project-id cdvubijjepwmhhkgppbl > src/lib/supabase/types.ts
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
        Row: { avatar_url: string | null; created_at: string; full_name: string | null; id: string; role: string; subscription_tier: string; updated_at: string }
        Insert: { avatar_url?: string | null; created_at?: string; full_name?: string | null; id: string; role?: string; subscription_tier?: string; updated_at?: string }
        Update: { avatar_url?: string | null; created_at?: string; full_name?: string | null; id?: string; role?: string; subscription_tier?: string; updated_at?: string }
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
        Row: { body: string; cognitive_level: string | null; created_at: string; created_by: string | null; difficulty: string | null; domain_id: number; explanation: string | null; fts: unknown; id: string; is_active: boolean; is_ai_generated: boolean; question_type: string; source: string | null; source_id: string | null; topic_id: number | null; updated_at: string }
        Insert: { body: string; cognitive_level?: string | null; created_at?: string; created_by?: string | null; difficulty?: string | null; domain_id: number; explanation?: string | null; fts?: unknown; id?: string; is_active?: boolean; is_ai_generated?: boolean; question_type?: string; source?: string | null; source_id?: string | null; topic_id?: number | null; updated_at?: string }
        Update: { body?: string; cognitive_level?: string | null; created_at?: string; created_by?: string | null; difficulty?: string | null; domain_id?: number; explanation?: string | null; fts?: unknown; id?: string; is_active?: boolean; is_ai_generated?: boolean; question_type?: string; source?: string | null; source_id?: string | null; topic_id?: number | null; updated_at?: string }
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
