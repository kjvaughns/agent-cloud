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
      academy_courses: {
        Row: {
          category: string
          created_at: string
          description: string | null
          duration_minutes: number | null
          featured: boolean | null
          id: string
          instructor_name: string | null
          module_count: number | null
          published: boolean | null
          slug: string
          sort_order: number | null
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          featured?: boolean | null
          id?: string
          instructor_name?: string | null
          module_count?: number | null
          published?: boolean | null
          slug: string
          sort_order?: number | null
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          featured?: boolean | null
          id?: string
          instructor_name?: string | null
          module_count?: number | null
          published?: boolean | null
          slug?: string
          sort_order?: number | null
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: []
      }
      academy_modules: {
        Row: {
          content_html: string | null
          course_id: string
          id: string
          quiz: Json | null
          resource_urls: Json | null
          sort_order: number | null
          title: string
          video_url: string | null
        }
        Insert: {
          content_html?: string | null
          course_id: string
          id?: string
          quiz?: Json | null
          resource_urls?: Json | null
          sort_order?: number | null
          title: string
          video_url?: string | null
        }
        Update: {
          content_html?: string | null
          course_id?: string
          id?: string
          quiz?: Json | null
          resource_urls?: Json | null
          sort_order?: number | null
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "academy_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
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
      agent_integrations: {
        Row: {
          agent_id: string
          api_key: string | null
          created_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          platform: string
          sync_status: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          api_key?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          platform: string
          sync_status?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          api_key?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          platform?: string
          sync_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_landing_pages: {
        Row: {
          agent_id: string
          carriers: Json
          contact_email: string | null
          contact_phone: string | null
          custom_message: string | null
          id: string
          licensed_states: Json
          published: boolean
          specialties: Json
          updated_at: string
        }
        Insert: {
          agent_id: string
          carriers?: Json
          contact_email?: string | null
          contact_phone?: string | null
          custom_message?: string | null
          id?: string
          licensed_states?: Json
          published?: boolean
          specialties?: Json
          updated_at?: string
        }
        Update: {
          agent_id?: string
          carriers?: Json
          contact_email?: string | null
          contact_phone?: string | null
          custom_message?: string | null
          id?: string
          licensed_states?: Json
          published?: boolean
          specialties?: Json
          updated_at?: string
        }
        Relationships: []
      }
      agent_phone_settings: {
        Row: {
          agent_id: string
          created_at: string
          forwarding_enabled: boolean
          forwarding_number: string | null
          id: string
          phone_number: string | null
          sms_registration_status: string
          twilio_sid: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          forwarding_enabled?: boolean
          forwarding_number?: string | null
          id?: string
          phone_number?: string | null
          sms_registration_status?: string
          twilio_sid?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          forwarding_enabled?: boolean
          forwarding_number?: string | null
          id?: string
          phone_number?: string | null
          sms_registration_status?: string
          twilio_sid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_insights: {
        Row: {
          action_text: string | null
          action_url: string | null
          agent_id: string
          agent_name: string | null
          body: string | null
          dismissed: boolean
          dollar_impact: number | null
          generated_at: string
          id: string
          insight_type: string
          tab: string
          title: string
        }
        Insert: {
          action_text?: string | null
          action_url?: string | null
          agent_id: string
          agent_name?: string | null
          body?: string | null
          dismissed?: boolean
          dollar_impact?: number | null
          generated_at?: string
          id?: string
          insight_type: string
          tab?: string
          title: string
        }
        Update: {
          action_text?: string | null
          action_url?: string | null
          agent_id?: string
          agent_name?: string | null
          body?: string | null
          dismissed?: boolean
          dollar_impact?: number | null
          generated_at?: string
          id?: string
          insight_type?: string
          tab?: string
          title?: string
        }
        Relationships: []
      }
      analytics_insight_cache: {
        Row: {
          agent_id: string
          cache_key: string
          generated_at: string
          id: string
          payload: Json
        }
        Insert: {
          agent_id: string
          cache_key: string
          generated_at?: string
          id?: string
          payload: Json
        }
        Update: {
          agent_id?: string
          cache_key?: string
          generated_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
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
      background_questions: {
        Row: {
          agent_id: string
          answer: boolean
          explanation: string | null
          id: string
          question_number: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          answer: boolean
          explanation?: string | null
          id?: string
          question_number: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          answer?: boolean
          explanation?: string | null
          id?: string
          question_number?: number
          updated_at?: string
        }
        Relationships: []
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
          all_day: boolean
          client_id: string | null
          color: string | null
          end_at: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          is_auto_generated: boolean
          notes: string | null
          policy_id: string | null
          recurrence_rule: string | null
          reminder_minutes: number | null
          start_at: string
          title: string
        }
        Insert: {
          agent_id: string
          all_day?: boolean
          client_id?: string | null
          color?: string | null
          end_at?: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          is_auto_generated?: boolean
          notes?: string | null
          policy_id?: string | null
          recurrence_rule?: string | null
          reminder_minutes?: number | null
          start_at: string
          title: string
        }
        Update: {
          agent_id?: string
          all_day?: boolean
          client_id?: string | null
          color?: string | null
          end_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          is_auto_generated?: boolean
          notes?: string | null
          policy_id?: string | null
          recurrence_rule?: string | null
          reminder_minutes?: number | null
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
          outcome: string | null
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
          outcome?: string | null
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
          outcome?: string | null
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
          datalink_enabled: boolean
          hours: string | null
          id: string
          ideal_client: string | null
          is_annuity_carrier: boolean
          name: string
          pay_frequency: string | null
          phone: string | null
          surelc_carrier_code: string | null
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
          datalink_enabled?: boolean
          hours?: string | null
          id?: string
          ideal_client?: string | null
          is_annuity_carrier?: boolean
          name: string
          pay_frequency?: string | null
          phone?: string | null
          surelc_carrier_code?: string | null
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
          datalink_enabled?: boolean
          hours?: string | null
          id?: string
          ideal_client?: string | null
          is_annuity_carrier?: boolean
          name?: string
          pay_frequency?: string | null
          phone?: string | null
          surelc_carrier_code?: string | null
          training_url?: string | null
          website?: string | null
        }
        Relationships: []
      }
      case_design_requests: {
        Row: {
          additional_conditions: string | null
          additional_notes: string | null
          agent_id: string
          client_id: string | null
          client_name_manual: string | null
          coverage_amount: number | null
          created_at: string
          height_in: number | null
          hobbies: string | null
          id: string
          medications: string | null
          occupation: string | null
          primary_condition: string | null
          prior_decline: boolean | null
          prior_decline_details: string | null
          product_type: string | null
          responded_at: string | null
          responded_by: string | null
          response_html: string | null
          status: string
          tobacco_use: string | null
          weight_lbs: number | null
        }
        Insert: {
          additional_conditions?: string | null
          additional_notes?: string | null
          agent_id: string
          client_id?: string | null
          client_name_manual?: string | null
          coverage_amount?: number | null
          created_at?: string
          height_in?: number | null
          hobbies?: string | null
          id?: string
          medications?: string | null
          occupation?: string | null
          primary_condition?: string | null
          prior_decline?: boolean | null
          prior_decline_details?: string | null
          product_type?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_html?: string | null
          status?: string
          tobacco_use?: string | null
          weight_lbs?: number | null
        }
        Update: {
          additional_conditions?: string | null
          additional_notes?: string | null
          agent_id?: string
          client_id?: string | null
          client_name_manual?: string | null
          coverage_amount?: number | null
          created_at?: string
          height_in?: number | null
          hobbies?: string | null
          id?: string
          medications?: string | null
          occupation?: string | null
          primary_condition?: string | null
          prior_decline?: boolean | null
          prior_decline_details?: string | null
          product_type?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_html?: string | null
          status?: string
          tobacco_use?: string | null
          weight_lbs?: number | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          agent_id: string
          completed: boolean
          created_at: string
          current_value: number | null
          description: string | null
          end_date: string | null
          id: string
          period: string | null
          start_date: string | null
          target_value: number | null
          type: Database["public"]["Enums"]["challenge_type"]
        }
        Insert: {
          agent_id: string
          completed?: boolean
          created_at?: string
          current_value?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          period?: string | null
          start_date?: string | null
          target_value?: number | null
          type: Database["public"]["Enums"]["challenge_type"]
        }
        Update: {
          agent_id?: string
          completed?: boolean
          created_at?: string
          current_value?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          period?: string | null
          start_date?: string | null
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
      change_requests: {
        Row: {
          agent_id: string
          carrier_id: string | null
          contract_request_id: string | null
          id: string
          new_level_name: string | null
          new_level_pct: number | null
          new_upline_id: string | null
          other_description: string | null
          request_type: string
          resolved_at: string | null
          status: string
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          agent_id: string
          carrier_id?: string | null
          contract_request_id?: string | null
          id?: string
          new_level_name?: string | null
          new_level_pct?: number | null
          new_upline_id?: string | null
          other_description?: string | null
          request_type: string
          resolved_at?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          agent_id?: string
          carrier_id?: string | null
          contract_request_id?: string | null
          id?: string
          new_level_name?: string | null
          new_level_pct?: number | null
          new_upline_id?: string | null
          other_description?: string | null
          request_type?: string
          resolved_at?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: []
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
      commission_level_requests: {
        Row: {
          agent_id: string
          carrier_id: string
          created_at: string | null
          id: string
          message: string | null
          status: string | null
        }
        Insert: {
          agent_id: string
          carrier_id: string
          created_at?: string | null
          id?: string
          message?: string | null
          status?: string | null
        }
        Update: {
          agent_id?: string
          carrier_id?: string
          created_at?: string | null
          id?: string
          message?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_level_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_level_requests_carrier_id_fkey"
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
          loa: string | null
          notes: string | null
          requested_at: string
          source: string | null
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
          loa?: string | null
          notes?: string | null
          requested_at?: string
          source?: string | null
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
          loa?: string | null
          notes?: string | null
          requested_at?: string
          source?: string | null
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
      course_progress: {
        Row: {
          agent_id: string
          completed: boolean
          completed_at: string | null
          course_id: string
          id: string
          module_id: string
          quiz_score: number | null
        }
        Insert: {
          agent_id: string
          completed?: boolean
          completed_at?: string | null
          course_id: string
          id?: string
          module_id: string
          quiz_score?: number | null
        }
        Update: {
          agent_id?: string
          completed?: boolean
          completed_at?: string | null
          course_id?: string
          id?: string
          module_id?: string
          quiz_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "academy_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "academy_modules"
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
          notes: string | null
          outcome: string | null
          position: number
        }
        Insert: {
          called_at?: string | null
          client_id: string
          id?: string
          list_id: string
          notes?: string | null
          outcome?: string | null
          position?: number
        }
        Update: {
          called_at?: string | null
          client_id?: string
          id?: string
          list_id?: string
          notes?: string | null
          outcome?: string | null
          position?: number
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
      faq_items: {
        Row: {
          answer: string
          created_at: string
          id: string
          question: string
          section: string
          sort_order: number
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          question: string
          section: string
          sort_order?: number
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          question?: string
          section?: string
          sort_order?: number
        }
        Relationships: []
      }
      handbook_sections: {
        Row: {
          content_html: string | null
          id: string
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          content_html?: string | null
          id?: string
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          content_html?: string | null
          id?: string
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      invitation_links: {
        Row: {
          agent_completed_at: string | null
          agent_started_at: string | null
          carrier_assignments: Json
          created_at: string
          created_by: string
          existing_agent_id: string | null
          expires_at: string
          id: string
          invite_signature_html: string | null
          is_reusable: boolean
          last_resent_at: string | null
          link_name: string | null
          linked_agent_id: string | null
          name: string
          new_agent_email: string | null
          new_agent_first_name: string | null
          new_agent_last_name: string | null
          onboarding_step: number
          sent_on_behalf_of: string | null
          status: string
          surelc_agent_id: string | null
          token: string
        }
        Insert: {
          agent_completed_at?: string | null
          agent_started_at?: string | null
          carrier_assignments?: Json
          created_at?: string
          created_by: string
          existing_agent_id?: string | null
          expires_at?: string
          id?: string
          invite_signature_html?: string | null
          is_reusable?: boolean
          last_resent_at?: string | null
          link_name?: string | null
          linked_agent_id?: string | null
          name: string
          new_agent_email?: string | null
          new_agent_first_name?: string | null
          new_agent_last_name?: string | null
          onboarding_step?: number
          sent_on_behalf_of?: string | null
          status?: string
          surelc_agent_id?: string | null
          token: string
        }
        Update: {
          agent_completed_at?: string | null
          agent_started_at?: string | null
          carrier_assignments?: Json
          created_at?: string
          created_by?: string
          existing_agent_id?: string | null
          expires_at?: string
          id?: string
          invite_signature_html?: string | null
          is_reusable?: boolean
          last_resent_at?: string | null
          link_name?: string | null
          linked_agent_id?: string | null
          name?: string
          new_agent_email?: string | null
          new_agent_first_name?: string | null
          new_agent_last_name?: string | null
          onboarding_step?: number
          sent_on_behalf_of?: string | null
          status?: string
          surelc_agent_id?: string | null
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
          lead_count: number
          published: boolean | null
          template_slug: string
          title: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          custom_slug?: string | null
          id?: string
          lead_count?: number
          published?: boolean | null
          template_slug: string
          title?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          custom_slug?: string | null
          id?: string
          lead_count?: number
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
      onboarding_documents: {
        Row: {
          agent_id: string
          doc_type: string
          file_name: string | null
          file_url: string | null
          id: string
          invitation_id: string | null
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          agent_id: string
          doc_type: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          invitation_id?: string | null
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          agent_id?: string
          doc_type?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          invitation_id?: string | null
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: []
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
      producer_agreements: {
        Row: {
          agent_id: string
          agreement_version: string
          id: string
          signature_name: string
          signed_date: string
        }
        Insert: {
          agent_id: string
          agreement_version?: string
          id?: string
          signature_name: string
          signed_date?: string
        }
        Update: {
          agent_id?: string
          agreement_version?: string
          id?: string
          signature_name?: string
          signed_date?: string
        }
        Relationships: []
      }
      producer_banking: {
        Row: {
          account_last4: string | null
          account_number_encrypted: string | null
          account_type: string | null
          agent_id: string
          bank_name: string | null
          id: string
          routing_number: string | null
          updated_at: string | null
        }
        Insert: {
          account_last4?: string | null
          account_number_encrypted?: string | null
          account_type?: string | null
          agent_id: string
          bank_name?: string | null
          id?: string
          routing_number?: string | null
          updated_at?: string | null
        }
        Update: {
          account_last4?: string | null
          account_number_encrypted?: string | null
          account_type?: string | null
          agent_id?: string
          bank_name?: string | null
          id?: string
          routing_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producer_banking_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_documents: {
        Row: {
          agent_id: string
          carrier_name: string | null
          certificate_number: string | null
          coverage_amount: string | null
          created_at: string
          doc_type: string
          expiration_date: string | null
          file_name: string | null
          file_url: string | null
          id: string
          policy_number: string | null
          provider_name: string | null
          start_date: string | null
        }
        Insert: {
          agent_id: string
          carrier_name?: string | null
          certificate_number?: string | null
          coverage_amount?: string | null
          created_at?: string
          doc_type: string
          expiration_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          policy_number?: string | null
          provider_name?: string | null
          start_date?: string | null
        }
        Update: {
          agent_id?: string
          carrier_name?: string | null
          certificate_number?: string | null
          coverage_amount?: string | null
          created_at?: string
          doc_type?: string
          expiration_date?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          policy_number?: string | null
          provider_name?: string | null
          start_date?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agent_slug: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          drivers_license_expiry: string | null
          drivers_license_number: string | null
          drivers_license_state: string | null
          email: string | null
          first_name: string | null
          gender: string | null
          google_oauth_connected: boolean
          id: string
          invite_signature_html: string | null
          last_active_at: string | null
          last_name: string | null
          marital_status: string | null
          npn_number: string | null
          phone: string | null
          ssn_encrypted: string | null
          ssn_last4: string | null
          state: string | null
          status: string
          street_address: string | null
          upline_id: string | null
          zip_code: string | null
        }
        Insert: {
          agent_slug?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          drivers_license_state?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          google_oauth_connected?: boolean
          id: string
          invite_signature_html?: string | null
          last_active_at?: string | null
          last_name?: string | null
          marital_status?: string | null
          npn_number?: string | null
          phone?: string | null
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          upline_id?: string | null
          zip_code?: string | null
        }
        Update: {
          agent_slug?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          drivers_license_state?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          google_oauth_connected?: boolean
          id?: string
          invite_signature_html?: string | null
          last_active_at?: string | null
          last_name?: string | null
          marital_status?: string | null
          npn_number?: string | null
          phone?: string | null
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          upline_id?: string | null
          zip_code?: string | null
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
          applications: number
          created_at: string
          id: string
          name: string
          page_views: number
          published: boolean
          slug: string
          template_slug: string
        }
        Insert: {
          agent_id: string
          applications?: number
          created_at?: string
          id?: string
          name: string
          page_views?: number
          published?: boolean
          slug: string
          template_slug?: string
        }
        Update: {
          agent_id?: string
          applications?: number
          created_at?: string
          id?: string
          name?: string
          page_views?: number
          published?: boolean
          slug?: string
          template_slug?: string
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
      recruiting_prospect_notes: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          note: string
          prospect_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          note: string
          prospect_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          note?: string
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_prospect_notes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiting_prospect_notes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "recruiting_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiting_prospect_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: string
          prospect_id: string
          to_stage: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          prospect_id: string
          to_stage: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          prospect_id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_prospect_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiting_prospect_stage_history_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "recruiting_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiting_prospects: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          funnel_id: string | null
          id: string
          last_name: string | null
          linked_agent_id: string | null
          notes: string | null
          phone: string | null
          recruiter_id: string
          source: string | null
          stage: Database["public"]["Enums"]["recruiting_stage"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          funnel_id?: string | null
          id?: string
          last_name?: string | null
          linked_agent_id?: string | null
          notes?: string | null
          phone?: string | null
          recruiter_id: string
          source?: string | null
          stage?: Database["public"]["Enums"]["recruiting_stage"]
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          funnel_id?: string | null
          id?: string
          last_name?: string | null
          linked_agent_id?: string | null
          notes?: string | null
          phone?: string | null
          recruiter_id?: string
          source?: string | null
          stage?: Database["public"]["Enums"]["recruiting_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_prospects_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "recruiting_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiting_prospects_linked_agent_id_fkey"
            columns: ["linked_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiting_prospects_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          agent_id: string
          id: string
          sent_at: string
          sent_by: string
        }
        Insert: {
          agent_id: string
          id?: string
          sent_at?: string
          sent_by: string
        }
        Update: {
          agent_id?: string
          id?: string
          sent_at?: string
          sent_by?: string
        }
        Relationships: []
      }
      retirement_cases: {
        Row: {
          accounts: Json
          agent_id: string
          client_id: string | null
          created_at: string
          current_age: number | null
          current_savings: number | null
          expected_return_pct: number | null
          expenses_monthly: number | null
          healthcare_inflation_pct: number | null
          healthcare_monthly: number | null
          id: string
          income_sources: Json
          inflation_pct: number | null
          life_expectancy: number | null
          linked_policy_ids: Json
          monthly_contribution: number | null
          next_meeting_date: string | null
          projected_monthly_income: number | null
          projected_nest_egg: number | null
          retirement_age: number | null
          status: string
          success_probability_pct: number | null
          title: string | null
          updated_at: string
          withdrawal_rate_pct: number | null
        }
        Insert: {
          accounts?: Json
          agent_id: string
          client_id?: string | null
          created_at?: string
          current_age?: number | null
          current_savings?: number | null
          expected_return_pct?: number | null
          expenses_monthly?: number | null
          healthcare_inflation_pct?: number | null
          healthcare_monthly?: number | null
          id?: string
          income_sources?: Json
          inflation_pct?: number | null
          life_expectancy?: number | null
          linked_policy_ids?: Json
          monthly_contribution?: number | null
          next_meeting_date?: string | null
          projected_monthly_income?: number | null
          projected_nest_egg?: number | null
          retirement_age?: number | null
          status?: string
          success_probability_pct?: number | null
          title?: string | null
          updated_at?: string
          withdrawal_rate_pct?: number | null
        }
        Update: {
          accounts?: Json
          agent_id?: string
          client_id?: string | null
          created_at?: string
          current_age?: number | null
          current_savings?: number | null
          expected_return_pct?: number | null
          expenses_monthly?: number | null
          healthcare_inflation_pct?: number | null
          healthcare_monthly?: number | null
          id?: string
          income_sources?: Json
          inflation_pct?: number | null
          life_expectancy?: number | null
          linked_policy_ids?: Json
          monthly_contribution?: number | null
          next_meeting_date?: string | null
          projected_monthly_income?: number | null
          projected_nest_egg?: number | null
          retirement_age?: number | null
          status?: string
          success_probability_pct?: number | null
          title?: string | null
          updated_at?: string
          withdrawal_rate_pct?: number | null
        }
        Relationships: []
      }
      scripts: {
        Row: {
          accent_color: string | null
          category: Database["public"]["Enums"]["script_category"]
          content_html: string | null
          content_markdown: string | null
          created_at: string
          id: string
          long_description: string | null
          short_description: string | null
          sort_order: number | null
          title: string
        }
        Insert: {
          accent_color?: string | null
          category: Database["public"]["Enums"]["script_category"]
          content_html?: string | null
          content_markdown?: string | null
          created_at?: string
          id?: string
          long_description?: string | null
          short_description?: string | null
          sort_order?: number | null
          title: string
        }
        Update: {
          accent_color?: string | null
          category?: Database["public"]["Enums"]["script_category"]
          content_html?: string | null
          content_markdown?: string | null
          created_at?: string
          id?: string
          long_description?: string | null
          short_description?: string | null
          sort_order?: number | null
          title?: string
        }
        Relationships: []
      }
      sms_conversations: {
        Row: {
          agent_id: string
          client_id: string | null
          created_at: string
          id: string
          last_message_at: string
          phone_number: string
          unread_count: number
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          phone_number: string
          unread_count?: number
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          phone_number?: string
          unread_count?: number
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
          is_auto: boolean
          media_url: string | null
          sent_at: string
          status: string | null
          twilio_sid: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          direction: string
          id?: string
          is_auto?: boolean
          media_url?: string | null
          sent_at?: string
          status?: string | null
          twilio_sid?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          direction?: string
          id?: string
          is_auto?: boolean
          media_url?: string | null
          sent_at?: string
          status?: string | null
          twilio_sid?: string | null
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
      ssn_audit_log: {
        Row: {
          agent_id: string
          id: string
          revealed_at: string
          revealed_by: string
        }
        Insert: {
          agent_id: string
          id?: string
          revealed_at?: string
          revealed_by: string
        }
        Update: {
          agent_id?: string
          id?: string
          revealed_at?: string
          revealed_by?: string
        }
        Relationships: []
      }
      state_licenses: {
        Row: {
          agent_id: string
          created_at: string
          expires_date: string | null
          id: string
          is_resident: boolean | null
          issued_date: string | null
          license_number: string | null
          license_type: string | null
          loa: string | null
          loa_status: string | null
          npn_number: string | null
          state_code: string
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_date?: string | null
          id?: string
          is_resident?: boolean | null
          issued_date?: string | null
          license_number?: string | null
          license_type?: string | null
          loa?: string | null
          loa_status?: string | null
          npn_number?: string | null
          state_code: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_date?: string | null
          id?: string
          is_resident?: boolean | null
          issued_date?: string | null
          license_number?: string | null
          license_type?: string | null
          loa?: string | null
          loa_status?: string | null
          npn_number?: string | null
          state_code?: string
          updated_at?: string | null
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
      support_ticket_messages: {
        Row: {
          body: string
          created_at: string | null
          id: string
          sender_id: string | null
          sender_role: string | null
          ticket_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          sender_id?: string | null
          sender_role?: string | null
          ticket_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          sender_id?: string | null
          sender_role?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          agent_id: string
          category: string
          created_at: string | null
          description: string
          id: string
          priority: string
          status: string
          subject: string
          ticket_number: number
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          category: string
          created_at?: string | null
          description: string
          id?: string
          priority?: string
          status?: string
          subject: string
          ticket_number?: number
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          priority?: string
          status?: string
          subject?: string
          ticket_number?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      surelc_progress: {
        Row: {
          agent_id: string
          completed: boolean
          id: string
          invitation_id: string | null
          last_synced_at: string
          section_name: string
        }
        Insert: {
          agent_id: string
          completed?: boolean
          id?: string
          invitation_id?: string | null
          last_synced_at?: string
          section_name: string
        }
        Update: {
          agent_id?: string
          completed?: boolean
          id?: string
          invitation_id?: string | null
          last_synced_at?: string
          section_name?: string
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
          stripe_payment_id: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
        }
        Insert: {
          agent_id: string
          amount_cents: number
          created_at?: string
          description?: string | null
          id?: string
          stripe_payment_id?: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
        }
        Update: {
          agent_id?: string
          amount_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          stripe_payment_id?: string | null
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
      agent_completion: { Args: { _agent: string }; Returns: Json }
      get_agent_analytics: {
        Args: { _agent: string; _end: string; _start: string }
        Returns: Json
      }
      get_analytics_overview: {
        Args: { _end: string; _start: string }
        Returns: Json
      }
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
      get_carrier_breakdown: {
        Args: { _agent?: string; _end: string; _start: string }
        Returns: Json
      }
      get_daily_report: { Args: never; Returns: Json }
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
      get_invite_by_token: { Args: { _token: string }; Returns: Json }
      get_policy_analytics: { Args: never; Returns: Json }
      get_quality_metrics: { Args: never; Returns: Json }
      get_recruiting_funnel: { Args: never; Returns: Json }
      get_team_alerts: { Args: never; Returns: Json }
      get_team_downline: {
        Args: never
        Returns: {
          completion_pct: number
          contracts_count: number
          created_at: string
          depth_level: number
          email: string
          first_name: string
          id: string
          last_active_at: string
          last_name: string
          missing: Json
          phone: string
          policies_count: number
          premium_total: number
          status: string
          upline_id: string
        }[]
      }
      get_team_kpis: { Args: never; Returns: Json }
      get_team_leaderboard: {
        Args: { _end: string; _start: string }
        Returns: Json
      }
      get_trends_12mo: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_funnel_applications: {
        Args: { _slug: string }
        Returns: undefined
      }
      increment_funnel_views: { Args: { _slug: string }; Returns: undefined }
      increment_landing_leads: { Args: { _id: string }; Returns: undefined }
      is_in_downline: {
        Args: { _target: string; _upline: string }
        Returns: boolean
      }
      seed_agent_challenges: { Args: { _agent: string }; Returns: undefined }
      send_team_reminder: { Args: { _target: string }; Returns: Json }
      ssn_reveal: { Args: never; Returns: string }
      ssn_set: { Args: { _ssn: string }; Returns: undefined }
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
        | "policy_starting_soon"
        | "follow_up"
        | "meeting"
        | "call"
        | "other"
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
        "policy_starting_soon",
        "follow_up",
        "meeting",
        "call",
        "other",
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
