export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_commission_levels: {
        Row: {
          agent_id: string
          assigned_at: string
          assigned_by: string | null
          assigned_pct: number | null
          carrier_id: string
          commission_level: string | null
          id: string
        }
        Insert: {
          agent_id: string
          assigned_at?: string
          assigned_by?: string | null
          assigned_pct?: number | null
          carrier_id: string
          commission_level?: string | null
          id?: string
        }
        Update: {
          agent_id?: string
          assigned_at?: string
          assigned_by?: string | null
          assigned_pct?: number | null
          carrier_id?: string
          commission_level?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_commission_levels_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_commission_levels_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body_html: string | null
          created_at: string
          created_by: string | null
          id: string
          title: string
        }
        Insert: {
          body_html?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
        }
        Update: {
          body_html?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiaries: {
        Row: {
          client_id: string
          dob: string | null
          first_name: string
          id: string
          last_name: string | null
          percentage: number | null
          phone: string | null
          relationship: string | null
        }
        Insert: {
          client_id: string
          dob?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          percentage?: number | null
          phone?: string | null
          relationship?: string | null
        }
        Update: {
          client_id?: string
          dob?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          percentage?: number | null
          phone?: string | null
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiaries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          agent_id: string
          client_id: string | null
          end_at: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          notes: string | null
          start_at: string
          title: string
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          end_at?: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          notes?: string | null
          start_at: string
          title: string
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          end_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          notes?: string | null
          start_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          agent_id: string
          client_id: string | null
          created_at: string
          direction: string
          duration_seconds: number | null
          id: string
          phone_number: string
          recording_url: string | null
          summary: string | null
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          created_at?: string
          direction: string
          duration_seconds?: number | null
          id?: string
          phone_number: string
          recording_url?: string | null
          summary?: string | null
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          id?: string
          phone_number?: string
          recording_url?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          about_text: string | null
          active: boolean
          advance_cap: string | null
          advance_cap_amount: number | null
          advance_cap_months: number | null
          agent_portal_url: string | null
          contracting_speed_days: number | null
          hours: string | null
          id: string
          ideal_client: string | null
          is_annuity_carrier: boolean
          name: string
          pay_frequency: string | null
          phone: string | null
          training_url: string | null
          website: string | null
        }
        Insert: {
          about_text?: string | null
          active?: boolean
          advance_cap?: string | null
          advance_cap_amount?: number | null
          advance_cap_months?: number | null
          agent_portal_url?: string | null
          contracting_speed_days?: number | null
          hours?: string | null
          id?: string
          ideal_client?: string | null
          is_annuity_carrier?: boolean
          name: string
          pay_frequency?: string | null
          phone?: string | null
          training_url?: string | null
          website?: string | null
        }
        Update: {
          about_text?: string | null
          active?: boolean
          advance_cap?: string | null
          advance_cap_amount?: number | null
          advance_cap_months?: number | null
          agent_portal_url?: string | null
          contracting_speed_days?: number | null
          hours?: string | null
          id?: string
          ideal_client?: string | null
          is_annuity_carrier?: boolean
          name?: string
          pay_frequency?: string | null
          phone?: string | null
          training_url?: string | null
          website?: string | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          agent_id: string
          created_at: string
          current_value: number | null
          description: string | null
          id: string
          period: string | null
          target_value: number | null
          type: Database["public"]["Enums"]["challenge_type"]
        }
        Insert: {
          agent_id: string
          created_at?: string
          current_value?: number | null
          description?: string | null
          id?: string
          period?: string | null
          target_value?: number | null
          type: Database["public"]["Enums"]["challenge_type"]
        }
        Update: {
          agent_id?: string
          created_at?: string
          current_value?: number | null
          description?: string | null
          id?: string
          period?: string | null
          target_value?: number | null
          type?: Database["public"]["Enums"]["challenge_type"]
        }
        Relationships: [
          {
            foreignKeyName: "challenges_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_financials: {
        Row: {
          client_id: string
          earned_income: number | null
          employment_status: string | null
          id: string
          other_income: number | null
          pension: number | null
          retirement_age: number | null
          savings: number | null
          social_security: number | null
        }
        Insert: {
          client_id: string
          earned_income?: number | null
          employment_status?: string | null
          id?: string
          other_income?: number | null
          pension?: number | null
          retirement_age?: number | null
          savings?: number | null
          social_security?: number | null
        }
        Update: {
          client_id?: string
          earned_income?: number | null
          employment_status?: string | null
          id?: string
          other_income?: number | null
          pension?: number | null
          retirement_age?: number | null
          savings?: number | null
          social_security?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_financials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          agent_id: string
          best_time_to_call: string | null
          born_country_state: string | null
          city: string | null
          communication_notes: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          last_opened_at: string | null
          notes: string | null
          phone: string | null
          phone_type: string | null
          preferred_contact: string | null
          score_pct: number | null
          stage: Database["public"]["Enums"]["pipeline_stage"]
          state: string | null
          street_address: string | null
          temperature: Database["public"]["Enums"]["temperature"]
          zip_code: string | null
        }
        Insert: {
          agent_id: string
          best_time_to_call?: string | null
          born_country_state?: string | null
          city?: string | null
          communication_notes?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          last_opened_at?: string | null
          notes?: string | null
          phone?: string | null
          phone_type?: string | null
          preferred_contact?: string | null
          score_pct?: number | null
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          state?: string | null
          street_address?: string | null
          temperature?: Database["public"]["Enums"]["temperature"]
          zip_code?: string | null
        }
        Update: {
          agent_id?: string
          best_time_to_call?: string | null
          born_country_state?: string | null
          city?: string | null
          communication_notes?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          last_opened_at?: string | null
          notes?: string | null
          phone?: string | null
          phone_type?: string | null
          preferred_contact?: string | null
          score_pct?: number | null
          stage?: Database["public"]["Enums"]["pipeline_stage"]
          state?: string | null
          street_address?: string | null
          temperature?: Database["public"]["Enums"]["temperature"]
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_grids: {
        Row: {
          age_group_max: number | null
          age_group_min: number | null
          carrier_id: string
          id: string
          level_name: string | null
          product_name: string
          year_1_pct: number | null
          years_2_5_pct: number | null
          years_6_plus_pct: number | null
        }
        Insert: {
          age_group_max?: number | null
          age_group_min?: number | null
          carrier_id: string
          id?: string
          level_name?: string | null
          product_name: string
          year_1_pct?: number | null
          years_2_5_pct?: number | null
          years_6_plus_pct?: number | null
        }
        Update: {
          age_group_max?: number | null
          age_group_min?: number | null
          carrier_id?: string
          id?: string
          level_name?: string | null
          product_name?: string
          year_1_pct?: number | null
          years_2_5_pct?: number | null
          years_6_plus_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_grids_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_schedule: {
        Row: {
          agent_id: string
          amount: number
          carrier: string | null
          created_at: string
          id: string
          is_gtl: boolean
          paid_at: string | null
          payment_date: string
          payment_type: string
          policy_id: string
          product: string | null
          source_agent_id: string | null
          status: string
        }
        Insert: {
          agent_id: string
          amount?: number
          carrier?: string | null
          created_at?: string
          id?: string
          is_gtl?: boolean
          paid_at?: string | null
          payment_date: string
          payment_type: string
          policy_id: string
          product?: string | null
          source_agent_id?: string | null
          status?: string
        }
        Update: {
          agent_id?: string
          amount?: number
          carrier?: string | null
          created_at?: string
          id?: string
          is_gtl?: boolean
          paid_at?: string | null
          payment_date?: string
          payment_type?: string
          policy_id?: string
          product?: string | null
          source_agent_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_schedule_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_history: {
        Row: {
          agent_id: string
          client_id: string
          contact_type: string | null
          created_at: string
          id: string
          is_auto: boolean | null
          note: string | null
        }
        Insert: {
          agent_id: string
          client_id: string
          contact_type?: string | null
          created_at?: string
          id?: string
          is_auto?: boolean | null
          note?: string | null
        }
        Update: {
          agent_id?: string
          client_id?: string
          contact_type?: string | null
          created_at?: string
          id?: string
          is_auto?: boolean | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_requests: {
        Row: {
          activated_at: string | null
          agent_id: string
          carrier_id: string
          id: string
          issue_description: string | null
          notes: string | null
          requested_at: string
          status: Database["public"]["Enums"]["contract_status"]
          submitted_at: string | null
          writing_number: string | null
        }
        Insert: {
          activated_at?: string | null
          agent_id: string
          carrier_id: string
          id?: string
          issue_description?: string | null
          notes?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["contract_status"]
          submitted_at?: string | null
          writing_number?: string | null
        }
        Update: {
          activated_at?: string | null
          agent_id?: string
          carrier_id?: string
          id?: string
          issue_description?: string | null
          notes?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["contract_status"]
          submitted_at?: string | null
          writing_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_requests_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      dial_list_entries: {
        Row: {
          called_at: string | null
          client_id: string
          id: string
          list_id: string
          outcome: string | null
        }
        Insert: {
          called_at?: string | null
          client_id: string
          id?: string
          list_id: string
          outcome?: string | null
        }
        Update: {
          called_at?: string | null
          client_id?: string
          id?: string
          list_id?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dial_list_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dial_list_entries_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "dial_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      dial_lists: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "dial_lists_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_links: {
        Row: {
          carrier_assignments: Json
          created_at: string
          created_by: string
          id: string
          name: string
          token: string
        }
        Insert: {
          carrier_assignments?: Json
          created_at?: string
          created_by: string
          id?: string
          name: string
          token: string
        }
        Update: {
          carrier_assignments?: Json
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          agent_id: string
          created_at: string
          custom_slug: string | null
          id: string
          published: boolean | null
          template_slug: string
          title: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          custom_slug?: string | null
          id?: string
          published?: boolean | null
          template_slug: string
          title?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          custom_slug?: string | null
          id?: string
          published?: boolean | null
          template_slug?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_pages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      life_events: {
        Row: {
          client_id: string
          event_date: string | null
          event_type: string | null
          id: string
          note: string | null
        }
        Insert: {
          client_id: string
          event_date?: string | null
          event_type?: string | null
          id?: string
          note?: string | null
        }
        Update: {
          client_id?: string
          event_date?: string | null
          event_type?: string | null
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "life_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      needs_analysis: {
        Row: {
          agent_id: string
          client_id: string
          created_at: string
          id: string
          question_key: string
          response: string | null
        }
        Insert: {
          agent_id: string
          client_id: string
          created_at?: string
          id?: string
          question_key: string
          response?: string | null
        }
        Update: {
          agent_id?: string
          client_id?: string
          created_at?: string
          id?: string
          question_key?: string
          response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "needs_analysis_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "needs_analysis_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      news_articles: {
        Row: {
          category: string | null
          fetched_at: string
          id: string
          image_url: string | null
          published_at: string | null
          source_name: string | null
          summary: string | null
          title: string
          url: string
        }
        Insert: {
          category?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          source_name?: string | null
          summary?: string | null
          title: string
          url: string
        }
        Update: {
          category?: string | null
          fetched_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          source_name?: string | null
          summary?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          description: string | null
          id: string
          read: boolean | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          read?: boolean | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          read?: boolean | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          agent_id: string
          annual_premium: number | null
          carrier_id: string | null
          carrier_integration: string | null
          client_id: string
          effective_date: string | null
          face_amount: number | null
          id: string
          is_gtl: boolean
          monthly_premium: number | null
          policy_number: string | null
          posted_at: string
          product: string | null
          status: Database["public"]["Enums"]["policy_status"]
        }
        Insert: {
          agent_id: string
          annual_premium?: number | null
          carrier_id?: string | null
          carrier_integration?: string | null
          client_id: string
          effective_date?: string | null
          face_amount?: number | null
          id?: string
          is_gtl?: boolean
          monthly_premium?: number | null
          policy_number?: string | null
          posted_at?: string
          product?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
        }
        Update: {
          agent_id?: string
          annual_premium?: number | null
          carrier_id?: string | null
          carrier_integration?: string | null
          client_id?: string
          effective_date?: string | null
          face_amount?: number | null
          id?: string
          is_gtl?: boolean
          monthly_premium?: number | null
          policy_number?: string | null
          posted_at?: string
          product?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
        }
        Relationships: [
          {
            foreignKeyName: "policies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_documents: {
        Row: {
          agent_id: string
          created_at: string
          doc_type: string
          expiration_date: string | null
          file_name: string | null
          file_url: string | null
          id: string
          start_date: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          doc_type: string
          expiration_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          start_date?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          doc_type?: string
          expiration_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          start_date?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          upline_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          upline_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          upline_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_upline_id_fkey"
            columns: ["upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiting_funnels: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          name: string
          published: boolean | null
          slug: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          name: string
          published?: boolean | null
          slug?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          name?: string
          published?: boolean | null
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_funnels_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiting_prospects: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          recruiter_id: string
          stage: Database["public"]["Enums"]["recruiting_stage"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          recruiter_id: string
          stage?: Database["public"]["Enums"]["recruiting_stage"]
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          recruiter_id?: string
          stage?: Database["public"]["Enums"]["recruiting_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_prospects_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          category: Database["public"]["Enums"]["script_category"]
          content_markdown: string | null
          created_at: string
          id: string
          title: string
        }
        Insert: {
          category: Database["public"]["Enums"]["script_category"]
          content_markdown?: string | null
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          category?: Database["public"]["Enums"]["script_category"]
          content_markdown?: string | null
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      sms_conversations: {
        Row: {
          agent_id: string
          client_id: string | null
          id: string
          last_message_at: string
          phone_number: string
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          id?: string
          last_message_at?: string
          phone_number: string
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          id?: string
          last_message_at?: string
          phone_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_messages: {
        Row: {
          body: string | null
          conversation_id: string
          direction: string
          id: string
          media_url: string | null
          sent_at: string
          status: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          direction: string
          id?: string
          media_url?: string | null
          sent_at?: string
          status?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          direction?: string
          id?: string
          media_url?: string | null
          sent_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sms_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      sophai_activity: {
        Row: {
          activity_type: string
          agent_id: string
          client_id: string | null
          created_at: string
          id: string
          outcome: string | null
        }
        Insert: {
          activity_type: string
          agent_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          outcome?: string | null
        }
        Update: {
          activity_type?: string
          agent_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sophai_activity_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sophai_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sophai_settings: {
        Row: {
          agent_id: string
          beneficiary_engagement_enabled: boolean | null
          birthday_messages_enabled: boolean | null
          id: string
          policy_recovery_enabled: boolean | null
          sms_followup_enabled: boolean | null
        }
        Insert: {
          agent_id: string
          beneficiary_engagement_enabled?: boolean | null
          birthday_messages_enabled?: boolean | null
          id?: string
          policy_recovery_enabled?: boolean | null
          sms_followup_enabled?: boolean | null
        }
        Update: {
          agent_id?: string
          beneficiary_engagement_enabled?: boolean | null
          birthday_messages_enabled?: boolean | null
          id?: string
          policy_recovery_enabled?: boolean | null
          sms_followup_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "sophai_settings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      state_licenses: {
        Row: {
          agent_id: string
          created_at: string
          expires_date: string | null
          id: string
          issued_date: string | null
          license_number: string | null
          state_code: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_date?: string | null
          id?: string
          issued_date?: string | null
          license_number?: string | null
          state_code: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_date?: string | null
          id?: string
          issued_date?: string | null
          license_number?: string | null
          state_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_licenses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      states_reference: {
        Row: {
          doi_url: string | null
          license_fee_cents: number | null
          prelicensing_url: string | null
          state_code: string
          state_name: string
          timezone: string | null
        }
        Insert: {
          doi_url?: string | null
          license_fee_cents?: number | null
          prelicensing_url?: string | null
          state_code: string
          state_name: string
          timezone?: string | null
        }
        Update: {
          doi_url?: string | null
          license_fee_cents?: number | null
          prelicensing_url?: string | null
          state_code?: string
          state_name?: string
          timezone?: string | null
        }
        Relationships: []
      }
      transfer_requests: {
        Row: {
          agent_id: string
          carrier_id: string
          created_at: string
          from_upline_id: string | null
          id: string
          status: string
          to_upline_id: string | null
        }
        Insert: {
          agent_id: string
          carrier_id: string
          created_at?: string
          from_upline_id?: string | null
          id?: string
          status?: string
          to_upline_id?: string | null
        }
        Update: {
          agent_id?: string
          carrier_id?: string
          created_at?: string
          from_upline_id?: string | null
          id?: string
          status?: string
          to_upline_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_from_upline_id_fkey"
            columns: ["from_upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_to_upline_id_fkey"
            columns: ["to_upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trophies: {
        Row: {
          agent_id: string
          challenge_id: string | null
          earned_at: string
          id: string
          type: Database["public"]["Enums"]["challenge_type"]
        }
        Insert: {
          agent_id: string
          challenge_id?: string | null
          earned_at?: string
          id?: string
          type: Database["public"]["Enums"]["challenge_type"]
        }
        Update: {
          agent_id?: string
          challenge_id?: string | null
          earned_at?: string
          id?: string
          type?: Database["public"]["Enums"]["challenge_type"]
        }
        Relationships: [
          {
            foreignKeyName: "trophies_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trophies_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet: {
        Row: {
          agent_id: string
          balance_cents: number
          id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          balance_cents?: number
          id?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          balance_cents?: number
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          agent_id: string
          amount_cents: number
          created_at: string
          description: string | null
          id: string
          type: Database["public"]["Enums"]["wallet_txn_type"]
        }
        Insert: {
          agent_id: string
          amount_cents: number
          created_at?: string
          description?: string | null
          id?: string
          type: Database["public"]["Enums"]["wallet_txn_type"]
        }
        Update: {
          agent_id?: string
          amount_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          type?: Database["public"]["Enums"]["wallet_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_book_of_business: {
        Args: { _agent_id?: string; _scope: string }
        Returns: {
          agent_first_name: string
          agent_id: string
          agent_last_name: string
          annual_premium: number
          carrier_id: string
          carrier_integration: string
          carrier_name: string
          client_first_name: string
          client_id: string
          client_last_name: string
          effective_date: string
          face_amount: number
          id: string
          is_gtl: boolean
          monthly_premium: number
          policy_number: string
          posted_at: string
          product: string
          status: Database["public"]["Enums"]["policy_status"]
        }[]
      }
      get_dashboard_metrics: {
        Args: { _range_end: string; _range_start: string }
        Returns: Json
      }
      get_downline_agents: {
        Args: never
        Returns: {
          first_name: string
          id: string
          last_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_in_downline: {
        Args: { _target: string; _upline: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "agent" | "manager" | "admin"
      challenge_type: "daily" | "weekly" | "monthly" | "quarterly"
      contract_status:
        | "requested"
        | "submitted"
        | "processing"
        | "issue"
        | "active"
        | "rejected"
      event_type:
        | "appointment"
        | "birthday"
        | "policy_anniversary"
        | "beneficiary_checkin"
        | "lapse_follow_up"
      pipeline_stage: "new" | "callback" | "almost_there" | "sold"
      policy_status:
        | "active"
        | "issued_not_paid"
        | "in_review"
        | "lapse_pending"
        | "lapsed"
        | "cancelled"
        | "withdrawn"
        | "not_taken"
        | "postponed"
        | "carrier_na"
      recruiting_stage:
        | "new"
        | "callback"
        | "in_course"
        | "getting_licensed"
        | "onboarded"
      script_category:
        | "basic"
        | "needs_analysis"
        | "objection_handling"
        | "mortgage_protection"
        | "beneficiary"
        | "check_in"
      temperature: "hot" | "warm" | "cold"
      wallet_txn_type:
        | "sms_out"
        | "sms_in"
        | "mms_out"
        | "mms_in"
        | "call_out"
        | "call_in"
        | "policy_recovery_ai"
        | "top_up"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["agent", "manager", "admin"],
      challenge_type: ["daily", "weekly", "monthly", "quarterly"],
      contract_status: [
        "requested",
        "submitted",
        "processing",
        "issue",
        "active",
        "rejected",
      ],
      event_type: [
        "appointment",
        "birthday",
        "policy_anniversary",
        "beneficiary_checkin",
        "lapse_follow_up",
      ],
      pipeline_stage: ["new", "callback", "almost_there", "sold"],
      policy_status: [
        "active",
        "issued_not_paid",
        "in_review",
        "lapse_pending",
        "lapsed",
        "cancelled",
        "withdrawn",
        "not_taken",
        "postponed",
        "carrier_na",
      ],
      recruiting_stage: [
        "new",
        "callback",
        "in_course",
        "getting_licensed",
        "onboarded",
      ],
      script_category: [
        "basic",
        "needs_analysis",
        "objection_handling",
        "mortgage_protection",
        "beneficiary",
        "check_in",
      ],
      temperature: ["hot", "warm", "cold"],
      wallet_txn_type: [
        "sms_out",
        "sms_in",
        "mms_out",
        "mms_in",
        "call_out",
        "call_in",
        "policy_recovery_ai",
        "top_up",
      ],
    },
  },
} as const
