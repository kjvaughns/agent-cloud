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
          forked_from: string | null
          id: string
          instructor_name: string | null
          module_count: number | null
          organization_id: string | null
          published: boolean | null
          slug: string
          sort_order: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          updated_by: string | null
          url: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          featured?: boolean | null
          forked_from?: string | null
          id?: string
          instructor_name?: string | null
          module_count?: number | null
          organization_id?: string | null
          published?: boolean | null
          slug: string
          sort_order?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          featured?: boolean | null
          forked_from?: string | null
          id?: string
          instructor_name?: string | null
          module_count?: number | null
          organization_id?: string | null
          published?: boolean | null
          slug?: string
          sort_order?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academy_courses_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "academy_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_courses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_modules: {
        Row: {
          content_html: string | null
          course_id: string
          created_at: string
          duration_minutes: number
          id: string
          is_published: boolean
          kind: string
          quiz: Json | null
          resource_urls: Json | null
          section: string | null
          sort_order: number | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          content_html?: string | null
          course_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_published?: boolean
          kind?: string
          quiz?: Json | null
          resource_urls?: Json | null
          section?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          content_html?: string | null
          course_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          is_published?: boolean
          kind?: string
          quiz?: Json | null
          resource_urls?: Json | null
          section?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
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
      admin_import_jobs: {
        Row: {
          admin_id: string
          ai_error: string | null
          clients_imported: number
          completed_at: string | null
          created_at: string
          duplicates_skipped: number
          extracted_json: Json | null
          file_name: string
          file_path: string | null
          file_type: string
          id: string
          notes_imported: number
          policies_imported: number
          scrape_request_id: string | null
          status: string
          target_agent_id: string
        }
        Insert: {
          admin_id: string
          ai_error?: string | null
          clients_imported?: number
          completed_at?: string | null
          created_at?: string
          duplicates_skipped?: number
          extracted_json?: Json | null
          file_name: string
          file_path?: string | null
          file_type: string
          id?: string
          notes_imported?: number
          policies_imported?: number
          scrape_request_id?: string | null
          status?: string
          target_agent_id: string
        }
        Update: {
          admin_id?: string
          ai_error?: string | null
          clients_imported?: number
          completed_at?: string | null
          created_at?: string
          duplicates_skipped?: number
          extracted_json?: Json | null
          file_name?: string
          file_path?: string | null
          file_type?: string
          id?: string
          notes_imported?: number
          policies_imported?: number
          scrape_request_id?: string | null
          status?: string
          target_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_import_jobs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_import_jobs_scrape_request_id_fkey"
            columns: ["scrape_request_id"]
            isOneToOne: false
            referencedRelation: "scrape_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_import_jobs_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: string | null
          pending: boolean
          writing_number: string | null
        }
        Insert: {
          agent_id: string
          assigned_at?: string
          assigned_by?: string | null
          assigned_pct?: number | null
          carrier_id: string
          commission_level?: string | null
          id?: string
          organization_id?: string | null
          pending?: boolean
          writing_number?: string | null
        }
        Update: {
          agent_id?: string
          assigned_at?: string
          assigned_by?: string | null
          assigned_pct?: number | null
          carrier_id?: string
          commission_level?: string | null
          id?: string
          organization_id?: string | null
          pending?: boolean
          writing_number?: string | null
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
          {
            foreignKeyName: "agent_commission_levels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_current_contracts: {
        Row: {
          agent_id: string
          agent_number: string | null
          carrier_id: string | null
          carrier_name: string | null
          created_at: string
          current_level: string | null
          effective_date: string | null
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_number?: string | null
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          current_level?: string | null
          effective_date?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_number?: string | null
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          current_level?: string | null
          effective_date?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_current_contracts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_current_contracts_carrier_id_fkey"
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
          organization_id: string | null
          title: string
        }
        Insert: {
          body_html?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
          title: string
        }
        Update: {
          body_html?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_value: Json | null
          organization_id: string | null
          performed_by: string | null
          previous_value: Json | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          organization_id?: string | null
          performed_by?: string | null
          previous_value?: Json | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          organization_id?: string | null
          performed_by?: string | null
          previous_value?: Json | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_job_runs: {
        Row: {
          acted: number
          considered: number
          created_at: string
          detail: Json
          error: string | null
          errored: number
          finished_at: string | null
          id: string
          job_key: string
          organization_id: string | null
          skipped: number
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          acted?: number
          considered?: number
          created_at?: string
          detail?: Json
          error?: string | null
          errored?: number
          finished_at?: string | null
          id?: string
          job_key: string
          organization_id?: string | null
          skipped?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Update: {
          acted?: number
          considered?: number
          created_at?: string
          detail?: Json
          error?: string | null
          errored?: number
          finished_at?: string | null
          id?: string
          job_key?: string
          organization_id?: string | null
          skipped?: number
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_job_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          agent_id: string
          automation_id: string
          channel: string
          created_at: string
          id: string
          occurrence_key: string
          organization_id: string | null
          reason: string | null
          rendered_message: string | null
          sent_at: string | null
          status: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          agent_id: string
          automation_id: string
          channel: string
          created_at?: string
          id?: string
          occurrence_key: string
          organization_id?: string | null
          reason?: string | null
          rendered_message?: string | null
          sent_at?: string | null
          status?: string
          subject_id: string
          subject_type: string
        }
        Update: {
          agent_id?: string
          automation_id?: string
          channel?: string
          created_at?: string
          id?: string
          occurrence_key?: string
          organization_id?: string | null
          reason?: string | null
          rendered_message?: string | null
          sent_at?: string | null
          status?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "nova_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "call_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_comp_levels: {
        Row: {
          advance_months: number | null
          advance_pct: number | null
          chargeback_rules: string | null
          commission_pct: number | null
          created_at: string
          created_by: string | null
          effective_date: string | null
          id: string
          level_name: string
          max_downline_level_id: string | null
          min_production_requirements: string | null
          notes: string | null
          org_carrier_id: string
          organization_id: string
          renewal_pct: number | null
          role_eligibility: string[]
          sort_order: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          advance_months?: number | null
          advance_pct?: number | null
          chargeback_rules?: string | null
          commission_pct?: number | null
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          level_name: string
          max_downline_level_id?: string | null
          min_production_requirements?: string | null
          notes?: string | null
          org_carrier_id: string
          organization_id: string
          renewal_pct?: number | null
          role_eligibility?: string[]
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          advance_months?: number | null
          advance_pct?: number | null
          chargeback_rules?: string | null
          commission_pct?: number | null
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          level_name?: string
          max_downline_level_id?: string | null
          min_production_requirements?: string | null
          notes?: string | null
          org_carrier_id?: string
          organization_id?: string
          renewal_pct?: number | null
          role_eligibility?: string[]
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carrier_comp_levels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_comp_levels_max_downline_level_id_fkey"
            columns: ["max_downline_level_id"]
            isOneToOne: false
            referencedRelation: "carrier_comp_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_comp_levels_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_comp_levels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_comp_levels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_hierarchy_records: {
        Row: {
          agency_owner_id: string | null
          agency_owner_npn: string | null
          agency_writing_number: string | null
          agent_id: string
          confirmation_document_id: string | null
          created_at: string
          created_by: string | null
          current_comp_level_id: string | null
          current_role: string | null
          direct_upline_comp_level_id: string | null
          direct_upline_id: string | null
          direct_upline_name: string | null
          direct_upline_npn: string | null
          direct_upline_writing_number: string | null
          effective_date: string | null
          external_provider: string | null
          external_record_id: string | null
          hierarchy_path: string | null
          id: string
          last_synced_at: string | null
          manual_override: boolean
          notes: string | null
          org_carrier_id: string
          organization_id: string
          pending_change_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agency_owner_id?: string | null
          agency_owner_npn?: string | null
          agency_writing_number?: string | null
          agent_id: string
          confirmation_document_id?: string | null
          created_at?: string
          created_by?: string | null
          current_comp_level_id?: string | null
          current_role?: string | null
          direct_upline_comp_level_id?: string | null
          direct_upline_id?: string | null
          direct_upline_name?: string | null
          direct_upline_npn?: string | null
          direct_upline_writing_number?: string | null
          effective_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          hierarchy_path?: string | null
          id?: string
          last_synced_at?: string | null
          manual_override?: boolean
          notes?: string | null
          org_carrier_id: string
          organization_id: string
          pending_change_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agency_owner_id?: string | null
          agency_owner_npn?: string | null
          agency_writing_number?: string | null
          agent_id?: string
          confirmation_document_id?: string | null
          created_at?: string
          created_by?: string | null
          current_comp_level_id?: string | null
          current_role?: string | null
          direct_upline_comp_level_id?: string | null
          direct_upline_id?: string | null
          direct_upline_name?: string | null
          direct_upline_npn?: string | null
          direct_upline_writing_number?: string | null
          effective_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          hierarchy_path?: string | null
          id?: string
          last_synced_at?: string | null
          manual_override?: boolean
          notes?: string | null
          org_carrier_id?: string
          organization_id?: string
          pending_change_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carrier_hierarchy_records_agency_owner_id_fkey"
            columns: ["agency_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_hierarchy_records_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_hierarchy_records_confirmation_document_id_fkey"
            columns: ["confirmation_document_id"]
            isOneToOne: false
            referencedRelation: "producer_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_hierarchy_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_hierarchy_records_current_comp_level_id_fkey"
            columns: ["current_comp_level_id"]
            isOneToOne: false
            referencedRelation: "carrier_comp_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_hierarchy_records_direct_upline_comp_level_id_fkey"
            columns: ["direct_upline_comp_level_id"]
            isOneToOne: false
            referencedRelation: "carrier_comp_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_hierarchy_records_direct_upline_id_fkey"
            columns: ["direct_upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_hierarchy_records_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_hierarchy_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_hierarchy_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_mapping_templates: {
        Row: {
          carrier_id: string
          column_map: Json
          created_by: string
          id: string
          status_map: Json
          updated_at: string
        }
        Insert: {
          carrier_id: string
          column_map?: Json
          created_by: string
          id?: string
          status_map?: Json
          updated_at?: string
        }
        Update: {
          carrier_id?: string
          column_map?: Json
          created_by?: string
          id?: string
          status_map?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_mapping_templates_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_mapping_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_requirements: {
        Row: {
          active: boolean
          applies_to_comp_levels: string[]
          applies_to_contract_types: string[]
          applies_to_product_lines: string[]
          applies_to_states: string[]
          created_at: string
          created_by: string | null
          help_text: string | null
          hierarchy_changes_only: boolean
          id: string
          kind: string
          label: string
          necessity: string
          org_carrier_id: string
          organization_id: string
          requirement_key: string
          sort_order: number
          transfers_only: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to_comp_levels?: string[]
          applies_to_contract_types?: string[]
          applies_to_product_lines?: string[]
          applies_to_states?: string[]
          created_at?: string
          created_by?: string | null
          help_text?: string | null
          hierarchy_changes_only?: boolean
          id?: string
          kind: string
          label: string
          necessity?: string
          org_carrier_id: string
          organization_id: string
          requirement_key: string
          sort_order?: number
          transfers_only?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to_comp_levels?: string[]
          applies_to_contract_types?: string[]
          applies_to_product_lines?: string[]
          applies_to_states?: string[]
          created_at?: string
          created_by?: string | null
          help_text?: string | null
          hierarchy_changes_only?: boolean
          id?: string
          kind?: string
          label?: string
          necessity?: string
          org_carrier_id?: string
          organization_id?: string
          requirement_key?: string
          sort_order?: number
          transfers_only?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_requirements_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_requirements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_sync_logs: {
        Row: {
          carrier_id: string | null
          created_at: string
          file_name: string | null
          id: string
          matched: number
          organization_id: string | null
          total_rows: number
          unmatched: number
          updated: number
          uploaded_by: string
        }
        Insert: {
          carrier_id?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          matched?: number
          organization_id?: string | null
          total_rows?: number
          unmatched?: number
          updated?: number
          uploaded_by: string
        }
        Update: {
          carrier_id?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          matched?: number
          organization_id?: string | null
          total_rows?: number
          unmatched?: number
          updated?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrier_sync_logs_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_sync_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carrier_sync_logs_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          created_at: string
          created_by: string | null
          datalink_enabled: boolean
          hours: string | null
          id: string
          ideal_client: string | null
          is_annuity_carrier: boolean
          is_private: boolean
          logo_url: string | null
          name: string
          owner_organization_id: string | null
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
          created_at?: string
          created_by?: string | null
          datalink_enabled?: boolean
          hours?: string | null
          id?: string
          ideal_client?: string | null
          is_annuity_carrier?: boolean
          is_private?: boolean
          logo_url?: string | null
          name: string
          owner_organization_id?: string | null
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
          created_at?: string
          created_by?: string | null
          datalink_enabled?: boolean
          hours?: string | null
          id?: string
          ideal_client?: string | null
          is_annuity_carrier?: boolean
          is_private?: boolean
          logo_url?: string | null
          name?: string
          owner_organization_id?: string | null
          pay_frequency?: string | null
          phone?: string | null
          surelc_carrier_code?: string | null
          training_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carriers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carriers_owner_organization_id_fkey"
            columns: ["owner_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: string | null
          period: string | null
          start_date: string | null
          target_value: number | null
          type: string
        }
        Insert: {
          agent_id: string
          completed?: boolean
          created_at?: string
          current_value?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          organization_id?: string | null
          period?: string | null
          start_date?: string | null
          target_value?: number | null
          type: string
        }
        Update: {
          agent_id?: string
          completed?: boolean
          created_at?: string
          current_value?: number | null
          description?: string | null
          end_date?: string | null
          id?: string
          organization_id?: string | null
          period?: string | null
          start_date?: string | null
          target_value?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      client_banking: {
        Row: {
          account_number_masked: string | null
          account_type: string | null
          bank_name: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          card_name: string | null
          client_id: string
          created_at: string | null
          draft_date: number | null
          id: string
          payment_method: string | null
          routing_number: string | null
          updated_at: string | null
        }
        Insert: {
          account_number_masked?: string | null
          account_type?: string | null
          bank_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          card_name?: string | null
          client_id: string
          created_at?: string | null
          draft_date?: number | null
          id?: string
          payment_method?: string | null
          routing_number?: string | null
          updated_at?: string | null
        }
        Update: {
          account_number_masked?: string | null
          account_type?: string | null
          bank_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          card_name?: string | null
          client_id?: string
          created_at?: string | null
          draft_date?: number | null
          id?: string
          payment_method?: string | null
          routing_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_banking_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
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
          assigned_to_email: string | null
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
          organization_id: string | null
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
          assigned_to_email?: string | null
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
          organization_id?: string | null
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
          assigned_to_email?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_backfill_queue: {
        Row: {
          created_at: string | null
          id: string
          policy_id: string
          processed: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          policy_id: string
          processed?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          policy_id?: string
          processed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_backfill_queue_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_grid_uploads: {
        Row: {
          carrier_id: string | null
          carrier_name: string | null
          created_at: string
          error: string | null
          extracted: Json | null
          file_name: string
          file_url: string | null
          id: string
          mime_type: string | null
          organization_id: string | null
          row_count: number
          status: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          error?: string | null
          extracted?: Json | null
          file_name: string
          file_url?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string | null
          row_count?: number
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          error?: string | null
          extracted?: Json | null
          file_name?: string
          file_url?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string | null
          row_count?: number
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_grid_uploads_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_grid_uploads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_grid_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
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
          confidence: number | null
          created_at: string
          created_by: string | null
          effective_date: string | null
          id: string
          is_estimated: boolean
          level_name: string | null
          organization_id: string | null
          product_name: string
          source: string | null
          source_file: string | null
          updated_at: string
          year_1_pct: number | null
          years_2_5_pct: number | null
          years_6_plus_pct: number | null
        }
        Insert: {
          age_group_max?: number | null
          age_group_min?: number | null
          carrier_id: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          is_estimated?: boolean
          level_name?: string | null
          organization_id?: string | null
          product_name: string
          source?: string | null
          source_file?: string | null
          updated_at?: string
          year_1_pct?: number | null
          years_2_5_pct?: number | null
          years_6_plus_pct?: number | null
        }
        Update: {
          age_group_max?: number | null
          age_group_min?: number | null
          carrier_id?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          effective_date?: string | null
          id?: string
          is_estimated?: boolean
          level_name?: string | null
          organization_id?: string | null
          product_name?: string
          source?: string | null
          source_file?: string | null
          updated_at?: string
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
          {
            foreignKeyName: "commission_grids_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_grids_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
        }
        Insert: {
          agent_id: string
          carrier_id: string
          created_at?: string | null
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
        }
        Update: {
          agent_id?: string
          carrier_id?: string
          created_at?: string | null
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
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
          {
            foreignKeyName: "commission_level_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_schedule: {
        Row: {
          advance_pct: number | null
          agent_id: string
          amount: number
          annual_premium: number | null
          carrier: string | null
          client_name: string | null
          commission_pct: number | null
          created_at: string
          id: string
          is_gtl: boolean
          month_number: number | null
          organization_id: string | null
          paid_at: string | null
          payment_date: string
          payment_type: string
          policy_id: string
          policy_year: number | null
          product: string | null
          source_agent_id: string | null
          status: string
          writing_agent_id: string | null
          writing_agent_name: string | null
        }
        Insert: {
          advance_pct?: number | null
          agent_id: string
          amount?: number
          annual_premium?: number | null
          carrier?: string | null
          client_name?: string | null
          commission_pct?: number | null
          created_at?: string
          id?: string
          is_gtl?: boolean
          month_number?: number | null
          organization_id?: string | null
          paid_at?: string | null
          payment_date: string
          payment_type: string
          policy_id: string
          policy_year?: number | null
          product?: string | null
          source_agent_id?: string | null
          status?: string
          writing_agent_id?: string | null
          writing_agent_name?: string | null
        }
        Update: {
          advance_pct?: number | null
          agent_id?: string
          amount?: number
          annual_premium?: number | null
          carrier?: string | null
          client_name?: string | null
          commission_pct?: number | null
          created_at?: string
          id?: string
          is_gtl?: boolean
          month_number?: number | null
          organization_id?: string | null
          paid_at?: string | null
          payment_date?: string
          payment_type?: string
          policy_id?: string
          policy_year?: number | null
          product?: string | null
          source_agent_id?: string | null
          status?: string
          writing_agent_id?: string | null
          writing_agent_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_schedule_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_schedule_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_statement_lines: {
        Row: {
          agent_name: string | null
          created_at: string
          expected_amount: number | null
          id: string
          insured_name: string | null
          match_status: string
          matched_agent_id: string | null
          matched_policy_id: string | null
          matched_schedule_id: string | null
          note: string | null
          organization_id: string | null
          paid_amount: number
          paid_date: string | null
          policy_number: string | null
          product: string | null
          statement_id: string
          variance: number | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string
          expected_amount?: number | null
          id?: string
          insured_name?: string | null
          match_status?: string
          matched_agent_id?: string | null
          matched_policy_id?: string | null
          matched_schedule_id?: string | null
          note?: string | null
          organization_id?: string | null
          paid_amount?: number
          paid_date?: string | null
          policy_number?: string | null
          product?: string | null
          statement_id: string
          variance?: number | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string
          expected_amount?: number | null
          id?: string
          insured_name?: string | null
          match_status?: string
          matched_agent_id?: string | null
          matched_policy_id?: string | null
          matched_schedule_id?: string | null
          note?: string | null
          organization_id?: string | null
          paid_amount?: number
          paid_date?: string | null
          policy_number?: string | null
          product?: string | null
          statement_id?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_statement_lines_matched_agent_id_fkey"
            columns: ["matched_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_statement_lines_matched_policy_id_fkey"
            columns: ["matched_policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_statement_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_statement_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "commission_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_statements: {
        Row: {
          carrier_id: string | null
          carrier_name: string | null
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          organization_id: string | null
          parsed_total: number | null
          period_end: string | null
          period_start: string | null
          stated_total: number | null
          statement_date: string
          status: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          organization_id?: string | null
          parsed_total?: number | null
          period_end?: string | null
          period_start?: string | null
          stated_total?: number | null
          statement_date: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          organization_id?: string | null
          parsed_total?: number | null
          period_end?: string | null
          period_start?: string | null
          stated_total?: number | null
          statement_date?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_statements_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_statements_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comp_grid_history: {
        Row: {
          agent_id: string | null
          carrier_id: string | null
          change_type: string | null
          changed_by: string | null
          created_at: string | null
          effective_date: string | null
          id: string
          level_name: string | null
          new_value: string | null
          organization_id: string | null
          previous_value: string | null
          reason: string | null
        }
        Insert: {
          agent_id?: string | null
          carrier_id?: string | null
          change_type?: string | null
          changed_by?: string | null
          created_at?: string | null
          effective_date?: string | null
          id?: string
          level_name?: string | null
          new_value?: string | null
          organization_id?: string | null
          previous_value?: string | null
          reason?: string | null
        }
        Update: {
          agent_id?: string | null
          carrier_id?: string | null
          change_type?: string | null
          changed_by?: string | null
          created_at?: string | null
          effective_date?: string | null
          id?: string
          level_name?: string | null
          new_value?: string | null
          organization_id?: string | null
          previous_value?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comp_grid_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_grid_history_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_grid_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comp_grid_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_history: {
        Row: {
          agent_id: string
          assigned_to_email: string | null
          client_id: string
          contact_type: string | null
          created_at: string
          id: string
          is_auto: boolean | null
          note: string | null
          organization_id: string | null
        }
        Insert: {
          agent_id: string
          assigned_to_email?: string | null
          client_id: string
          contact_type?: string | null
          created_at?: string
          id?: string
          is_auto?: boolean | null
          note?: string | null
          organization_id?: string | null
        }
        Update: {
          agent_id?: string
          assigned_to_email?: string | null
          client_id?: string
          contact_type?: string | null
          created_at?: string
          id?: string
          is_auto?: boolean | null
          note?: string | null
          organization_id?: string | null
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
          {
            foreignKeyName: "contact_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_requests: {
        Row: {
          activated_at: string | null
          agent_id: string
          carrier_id: string
          commission_level: number | null
          data_source: string | null
          effective_date: string | null
          id: string
          issue_description: string | null
          loa: string | null
          notes: string | null
          organization_id: string | null
          products: string[] | null
          requested_at: string
          source: string | null
          status: Database["public"]["Enums"]["contract_status"]
          submitted_at: string | null
          surelc_request_id: string | null
          writing_number: string | null
        }
        Insert: {
          activated_at?: string | null
          agent_id: string
          carrier_id: string
          commission_level?: number | null
          data_source?: string | null
          effective_date?: string | null
          id?: string
          issue_description?: string | null
          loa?: string | null
          notes?: string | null
          organization_id?: string | null
          products?: string[] | null
          requested_at?: string
          source?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          submitted_at?: string | null
          surelc_request_id?: string | null
          writing_number?: string | null
        }
        Update: {
          activated_at?: string | null
          agent_id?: string
          carrier_id?: string
          commission_level?: number | null
          data_source?: string | null
          effective_date?: string | null
          id?: string
          issue_description?: string | null
          loa?: string | null
          notes?: string | null
          organization_id?: string | null
          products?: string[] | null
          requested_at?: string
          source?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          submitted_at?: string | null
          surelc_request_id?: string | null
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
          {
            foreignKeyName: "contract_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json
          new_value: Json | null
          organization_id: string | null
          previous_value: Json | null
          record_id: string | null
          record_type: string
          subject_agent_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          new_value?: Json | null
          organization_id?: string | null
          previous_value?: Json | null
          record_id?: string | null
          record_type: string
          subject_agent_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          new_value?: Json | null
          organization_id?: string | null
          previous_value?: Json | null
          record_id?: string | null
          record_type?: string
          subject_agent_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracting_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_audit_log_subject_agent_id_fkey"
            columns: ["subject_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_email_templates: {
        Row: {
          active: boolean
          applies_to: string[]
          body: string
          cc_email: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          name: string
          org_carrier_id: string | null
          organization_id: string
          subject: string
          suggested_attachments: string[]
          to_email: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to?: string[]
          body: string
          cc_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name: string
          org_carrier_id?: string | null
          organization_id: string
          subject: string
          suggested_attachments?: string[]
          to_email?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to?: string[]
          body?: string
          cc_email?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          name?: string
          org_carrier_id?: string | null
          organization_id?: string
          subject?: string
          suggested_attachments?: string[]
          to_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracting_email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_email_templates_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_email_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_field_mappings: {
        Row: {
          column_header: string
          column_index: number | null
          created_at: string
          id: string
          organization_id: string
          required: boolean
          sort_order: number
          source_key: string
          static_value: string | null
          template_id: string
          transform: string | null
          updated_at: string
        }
        Insert: {
          column_header: string
          column_index?: number | null
          created_at?: string
          id?: string
          organization_id: string
          required?: boolean
          sort_order?: number
          source_key: string
          static_value?: string | null
          template_id: string
          transform?: string | null
          updated_at?: string
        }
        Update: {
          column_header?: string
          column_index?: number | null
          created_at?: string
          id?: string
          organization_id?: string
          required?: boolean
          sort_order?: number
          source_key?: string
          static_value?: string | null
          template_id?: string
          transform?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracting_field_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_field_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contracting_spreadsheet_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_request_documents: {
        Row: {
          created_at: string
          document_id: string | null
          id: string
          organization_id: string
          request_id: string
          requirement_key: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          waived_reason: string | null
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id?: string
          organization_id: string
          request_id: string
          requirement_key: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          waived_reason?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          organization_id?: string
          request_id?: string
          requirement_key?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          waived_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracting_request_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "producer_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_request_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_request_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "contracting_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_request_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_request_states: {
        Row: {
          appointment_effective_date: string | null
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          request_id: string
          state_code: string
          status: string
          updated_at: string
          writing_number: string | null
        }
        Insert: {
          appointment_effective_date?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          request_id: string
          state_code: string
          status?: string
          updated_at?: string
          writing_number?: string | null
        }
        Update: {
          appointment_effective_date?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          request_id?: string
          state_code?: string
          status?: string
          updated_at?: string
          writing_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracting_request_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_request_states_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "contracting_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_requests: {
        Row: {
          agent_id: string
          approved_at: string | null
          assigned_at: string | null
          assigned_by: string | null
          assigned_to: string | null
          carrier_confirmation_number: string | null
          closed_at: string | null
          contract_record_id: string | null
          contract_type: string
          created_at: string
          created_by: string | null
          decline_reason: string | null
          declined_at: string | null
          desired_effective_date: string | null
          direct_upline_id: string | null
          due_date: string | null
          external_provider: string | null
          external_record_id: string | null
          external_status: string | null
          id: string
          integration_metadata: Json
          internal_notes: string | null
          is_transfer: boolean
          last_synced_at: string | null
          manual_override: boolean
          notes: string | null
          org_carrier_id: string
          organization_id: string
          priority: string
          product_lines: string[]
          readiness_blockers: Json
          readiness_checked_at: string | null
          readiness_pct: number
          readiness_state: string
          reference: string | null
          requested_advance_level: string | null
          requested_comp_level_id: string | null
          requested_hierarchy_note: string | null
          status: string
          submission_method: string | null
          submission_reference: string | null
          submitted_at: string | null
          submitted_by: string | null
          sync_error: string | null
          sync_source: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          approved_at?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          carrier_confirmation_number?: string | null
          closed_at?: string | null
          contract_record_id?: string | null
          contract_type?: string
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          desired_effective_date?: string | null
          direct_upline_id?: string | null
          due_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          external_status?: string | null
          id?: string
          integration_metadata?: Json
          internal_notes?: string | null
          is_transfer?: boolean
          last_synced_at?: string | null
          manual_override?: boolean
          notes?: string | null
          org_carrier_id: string
          organization_id: string
          priority?: string
          product_lines?: string[]
          readiness_blockers?: Json
          readiness_checked_at?: string | null
          readiness_pct?: number
          readiness_state?: string
          reference?: string | null
          requested_advance_level?: string | null
          requested_comp_level_id?: string | null
          requested_hierarchy_note?: string | null
          status?: string
          submission_method?: string | null
          submission_reference?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          sync_error?: string | null
          sync_source?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          approved_at?: string | null
          assigned_at?: string | null
          assigned_by?: string | null
          assigned_to?: string | null
          carrier_confirmation_number?: string | null
          closed_at?: string | null
          contract_record_id?: string | null
          contract_type?: string
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          desired_effective_date?: string | null
          direct_upline_id?: string | null
          due_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          external_status?: string | null
          id?: string
          integration_metadata?: Json
          internal_notes?: string | null
          is_transfer?: boolean
          last_synced_at?: string | null
          manual_override?: boolean
          notes?: string | null
          org_carrier_id?: string
          organization_id?: string
          priority?: string
          product_lines?: string[]
          readiness_blockers?: Json
          readiness_checked_at?: string | null
          readiness_pct?: number
          readiness_state?: string
          reference?: string | null
          requested_advance_level?: string | null
          requested_comp_level_id?: string | null
          requested_hierarchy_note?: string | null
          status?: string
          submission_method?: string | null
          submission_reference?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          sync_error?: string | null
          sync_source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracting_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_requests_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_requests_contract_record_id_fkey"
            columns: ["contract_record_id"]
            isOneToOne: false
            referencedRelation: "contract_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_requests_direct_upline_id_fkey"
            columns: ["direct_upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_requests_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_requests_requested_comp_level_id_fkey"
            columns: ["requested_comp_level_id"]
            isOneToOne: false
            referencedRelation: "carrier_comp_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_spreadsheet_templates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          file_name: string | null
          header_row: number
          id: string
          name: string
          org_carrier_id: string | null
          organization_id: string
          sheet_name: string | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name?: string | null
          header_row?: number
          id?: string
          name: string
          org_carrier_id?: string | null
          organization_id: string
          sheet_name?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name?: string | null
          header_row?: number
          id?: string
          name?: string
          org_carrier_id?: string | null
          organization_id?: string
          sheet_name?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracting_spreadsheet_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_spreadsheet_templates_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_spreadsheet_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_status_history: {
        Row: {
          agent_visible_message: string | null
          attachment_document_id: string | null
          changed_by: string | null
          created_at: string
          due_date: string | null
          from_status: string | null
          id: string
          internal_message: string | null
          next_action: string | null
          organization_id: string
          request_id: string
          to_status: string
        }
        Insert: {
          agent_visible_message?: string | null
          attachment_document_id?: string | null
          changed_by?: string | null
          created_at?: string
          due_date?: string | null
          from_status?: string | null
          id?: string
          internal_message?: string | null
          next_action?: string | null
          organization_id: string
          request_id: string
          to_status: string
        }
        Update: {
          agent_visible_message?: string | null
          attachment_document_id?: string | null
          changed_by?: string | null
          created_at?: string
          due_date?: string | null
          from_status?: string | null
          id?: string
          internal_message?: string | null
          next_action?: string | null
          organization_id?: string
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracting_status_history_attachment_document_id_fkey"
            columns: ["attachment_document_id"]
            isOneToOne: false
            referencedRelation: "producer_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_status_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "contracting_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      contracting_submissions: {
        Row: {
          artifact_type: string
          change_request_id: string | null
          confirmation_reference: string | null
          generated_at: string
          generated_by: string | null
          id: string
          marked_submitted_at: string | null
          marked_submitted_by: string | null
          method: string | null
          notes: string | null
          organization_id: string
          payload_snapshot: Json
          recipient: string | null
          request_id: string | null
          row_count: number | null
          storage_path: string | null
          template_id: string | null
        }
        Insert: {
          artifact_type: string
          change_request_id?: string | null
          confirmation_reference?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          marked_submitted_at?: string | null
          marked_submitted_by?: string | null
          method?: string | null
          notes?: string | null
          organization_id: string
          payload_snapshot?: Json
          recipient?: string | null
          request_id?: string | null
          row_count?: number | null
          storage_path?: string | null
          template_id?: string | null
        }
        Update: {
          artifact_type?: string
          change_request_id?: string | null
          confirmation_reference?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          marked_submitted_at?: string | null
          marked_submitted_by?: string | null
          method?: string | null
          notes?: string | null
          organization_id?: string
          payload_snapshot?: Json
          recipient?: string | null
          request_id?: string | null
          row_count?: number | null
          storage_path?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracting_submissions_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "hierarchy_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_submissions_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_submissions_marked_submitted_by_fkey"
            columns: ["marked_submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracting_submissions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "contracting_requests"
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
      demo_requests: {
        Row: {
          agency_name: string | null
          agent_count: string | null
          assigned_to: string | null
          created_at: string
          current_tools: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          preferred_time: string | null
          primary_challenge: string | null
          source: string | null
          status: string
          updated_at: string
          utm: Json | null
        }
        Insert: {
          agency_name?: string | null
          agent_count?: string | null
          assigned_to?: string | null
          created_at?: string
          current_tools?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          preferred_time?: string | null
          primary_challenge?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          utm?: Json | null
        }
        Update: {
          agency_name?: string | null
          agent_count?: string | null
          assigned_to?: string | null
          created_at?: string
          current_tools?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          preferred_time?: string | null
          primary_challenge?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          utm?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          organization_id: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dial_lists_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dial_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_deliveries: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          http_status: number | null
          id: string
          organization_id: string | null
          policy_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          http_status?: number | null
          id?: string
          organization_id?: string | null
          policy_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          organization_id?: string | null
          policy_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discord_deliveries_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      discord_integrations: {
        Row: {
          channel_label: string | null
          created_at: string
          created_by: string | null
          enabled: boolean
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          min_annual_premium: number
          organization_id: string
          post_deals: boolean
          post_milestones: boolean
          post_new_agents: boolean
          updated_at: string
          webhook_url: string
        }
        Insert: {
          channel_label?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          min_annual_premium?: number
          organization_id: string
          post_deals?: boolean
          post_milestones?: boolean
          post_new_agents?: boolean
          updated_at?: string
          webhook_url: string
        }
        Update: {
          channel_label?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          min_annual_premium?: number
          organization_id?: string
          post_deals?: boolean
          post_milestones?: boolean
          post_new_agents?: boolean
          updated_at?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "discord_integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discord_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_log: {
        Row: {
          access_type: string
          accessed_by: string | null
          created_at: string
          document_id: string | null
          id: string
          ip_address: string | null
          organization_id: string | null
          pdb_upload_id: string | null
          subject_agent_id: string | null
          was_sensitive: boolean
        }
        Insert: {
          access_type: string
          accessed_by?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          pdb_upload_id?: string | null
          subject_agent_id?: string | null
          was_sensitive?: boolean
        }
        Update: {
          access_type?: string
          accessed_by?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          pdb_upload_id?: string | null
          subject_agent_id?: string | null
          was_sensitive?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "document_access_log_accessed_by_fkey"
            columns: ["accessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "producer_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_log_pdb_upload_id_fkey"
            columns: ["pdb_upload_id"]
            isOneToOne: false
            referencedRelation: "pdb_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_log_subject_agent_id_fkey"
            columns: ["subject_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_intake: {
        Row: {
          batch_id: string
          carrier_name: string | null
          confidence: number | null
          created_at: string
          doc_type: string | null
          error: string | null
          extracted: Json | null
          file_name: string
          file_url: string | null
          id: string
          mime_type: string | null
          organization_id: string | null
          period_label: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          status: string
          suggested_action: string | null
          summary: string | null
          updated_at: string
          uploaded_by: string | null
          user_note: string | null
        }
        Insert: {
          batch_id: string
          carrier_name?: string | null
          confidence?: number | null
          created_at?: string
          doc_type?: string | null
          error?: string | null
          extracted?: Json | null
          file_name: string
          file_url?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string | null
          period_label?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          status?: string
          suggested_action?: string | null
          summary?: string | null
          updated_at?: string
          uploaded_by?: string | null
          user_note?: string | null
        }
        Update: {
          batch_id?: string
          carrier_name?: string | null
          confidence?: number | null
          created_at?: string
          doc_type?: string | null
          error?: string | null
          extracted?: Json | null
          file_name?: string
          file_url?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string | null
          period_label?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          status?: string
          suggested_action?: string | null
          summary?: string | null
          updated_at?: string
          uploaded_by?: string | null
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_intake_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_intake_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_intake_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          send_key: string | null
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          send_key?: string | null
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          send_key?: string | null
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      export_log: {
        Row: {
          created_at: string
          export_type: string
          filters: Json | null
          id: string
          organization_id: string | null
          performed_by: string | null
          row_count: number
        }
        Insert: {
          created_at?: string
          export_type: string
          filters?: Json | null
          id?: string
          organization_id?: string | null
          performed_by?: string | null
          row_count?: number
        }
        Update: {
          created_at?: string
          export_type?: string
          filters?: Json | null
          id?: string
          organization_id?: string | null
          performed_by?: string | null
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "export_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_log_performed_by_fkey"
            columns: ["performed_by"]
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
          forked_from: string | null
          id: string
          organization_id: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_html?: string | null
          forked_from?: string | null
          id?: string
          organization_id?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_html?: string | null
          forked_from?: string | null
          id?: string
          organization_id?: string | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handbook_sections_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "handbook_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handbook_sections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handbook_sections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hierarchy_change_approvals: {
        Row: {
          approver_id: string | null
          change_request_id: string
          comment: string | null
          created_at: string
          decided_at: string | null
          decision: string
          id: string
          organization_id: string
          step: string
          step_order: number
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          change_request_id: string
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: string
          id?: string
          organization_id: string
          step: string
          step_order?: number
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          change_request_id?: string
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decision?: string
          id?: string
          organization_id?: string
          step?: string
          step_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hierarchy_change_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_approvals_change_request_id_fkey"
            columns: ["change_request_id"]
            isOneToOne: false
            referencedRelation: "hierarchy_change_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hierarchy_change_requests: {
        Row: {
          agent_id: string
          applied_at: string | null
          assigned_to: string | null
          carrier_impact: Json
          change_type: string
          commission_impact: Json
          created_at: string
          current_comp_level_id: string | null
          current_role: string | null
          current_upline_id: string | null
          current_writing_number: string | null
          decline_reason: string | null
          declined_at: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          org_carrier_id: string | null
          organization_id: string
          reason: string | null
          reference: string | null
          requested_comp_level_id: string | null
          requested_effective_date: string | null
          requested_role: string | null
          requested_upline_id: string | null
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          applied_at?: string | null
          assigned_to?: string | null
          carrier_impact?: Json
          change_type: string
          commission_impact?: Json
          created_at?: string
          current_comp_level_id?: string | null
          current_role?: string | null
          current_upline_id?: string | null
          current_writing_number?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          org_carrier_id?: string | null
          organization_id: string
          reason?: string | null
          reference?: string | null
          requested_comp_level_id?: string | null
          requested_effective_date?: string | null
          requested_role?: string | null
          requested_upline_id?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          applied_at?: string | null
          assigned_to?: string | null
          carrier_impact?: Json
          change_type?: string
          commission_impact?: Json
          created_at?: string
          current_comp_level_id?: string | null
          current_role?: string | null
          current_upline_id?: string | null
          current_writing_number?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          org_carrier_id?: string | null
          organization_id?: string
          reason?: string | null
          reference?: string | null
          requested_comp_level_id?: string | null
          requested_effective_date?: string | null
          requested_role?: string | null
          requested_upline_id?: string | null
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hierarchy_change_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_requests_current_comp_level_id_fkey"
            columns: ["current_comp_level_id"]
            isOneToOne: false
            referencedRelation: "carrier_comp_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_requests_current_upline_id_fkey"
            columns: ["current_upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_requests_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_requests_requested_comp_level_id_fkey"
            columns: ["requested_comp_level_id"]
            isOneToOne: false
            referencedRelation: "carrier_comp_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_requests_requested_upline_id_fkey"
            columns: ["requested_upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hierarchy_change_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_proposals: {
        Row: {
          applied_at: string | null
          applied_record_id: string | null
          apply_error: string | null
          batch_id: string
          confidence: number | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision: string
          document_id: string
          id: string
          match_id: string | null
          match_kind: string | null
          match_reason: string | null
          operation: string
          organization_id: string | null
          payload: Json
          scope: string
          target_table: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_record_id?: string | null
          apply_error?: string | null
          batch_id: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          document_id: string
          id?: string
          match_id?: string | null
          match_kind?: string | null
          match_reason?: string | null
          operation?: string
          organization_id?: string | null
          payload: Json
          scope?: string
          target_table: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_record_id?: string | null
          apply_error?: string | null
          batch_id?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          document_id?: string
          id?: string
          match_id?: string | null
          match_kind?: string | null
          match_reason?: string | null
          operation?: string
          organization_id?: string | null
          payload?: Json
          scope?: string
          target_table?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_proposals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_proposals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document_intake"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          invited_role: string | null
          is_reusable: boolean
          last_resent_at: string | null
          link_name: string | null
          linked_agent_id: string | null
          name: string
          new_agent_email: string | null
          new_agent_first_name: string | null
          new_agent_last_name: string | null
          onboarding_step: number
          organization_id: string | null
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
          invited_role?: string | null
          is_reusable?: boolean
          last_resent_at?: string | null
          link_name?: string | null
          linked_agent_id?: string | null
          name: string
          new_agent_email?: string | null
          new_agent_first_name?: string | null
          new_agent_last_name?: string | null
          onboarding_step?: number
          organization_id?: string | null
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
          invited_role?: string | null
          is_reusable?: boolean
          last_resent_at?: string | null
          link_name?: string | null
          linked_agent_id?: string | null
          name?: string
          new_agent_email?: string | null
          new_agent_first_name?: string | null
          new_agent_last_name?: string | null
          onboarding_step?: number
          organization_id?: string | null
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
          {
            foreignKeyName: "invitation_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          id: string
          invitation_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          id?: string
          invitation_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          id?: string
          invitation_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_acceptances_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitation_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_acceptances_profile_id_fkey"
            columns: ["profile_id"]
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "landing_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          question_key: string
          response: string | null
        }
        Insert: {
          agent_id: string
          client_id: string
          created_at?: string
          id?: string
          organization_id?: string | null
          question_key: string
          response?: string | null
        }
        Update: {
          agent_id?: string
          client_id?: string
          created_at?: string
          id?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "needs_analysis_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      notification_preferences: {
        Row: {
          email_enabled: boolean
          notify_announcements: boolean
          notify_billing: boolean
          notify_commission_posted: boolean
          notify_contract_updates: boolean
          notify_policy_at_risk: boolean
          notify_task_assigned: boolean
          notify_team_activity: boolean
          profile_id: string
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          sms_enabled: boolean
          timezone: string | null
          updated_at: string
        }
        Insert: {
          email_enabled?: boolean
          notify_announcements?: boolean
          notify_billing?: boolean
          notify_commission_posted?: boolean
          notify_contract_updates?: boolean
          notify_policy_at_risk?: boolean
          notify_task_assigned?: boolean
          notify_team_activity?: boolean
          profile_id: string
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          sms_enabled?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          email_enabled?: boolean
          notify_announcements?: boolean
          notify_billing?: boolean
          notify_commission_posted?: boolean
          notify_contract_updates?: boolean
          notify_policy_at_risk?: boolean
          notify_task_assigned?: boolean
          notify_team_activity?: boolean
          profile_id?: string
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          sms_enabled?: boolean
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      nova_automations: {
        Row: {
          agent_id: string
          channel: string
          created_at: string
          custom_date: string | null
          enabled: boolean
          id: string
          last_run_at: string | null
          message_template: string
          name: string
          organization_id: string | null
          trigger_type: string
        }
        Insert: {
          agent_id: string
          channel?: string
          created_at?: string
          custom_date?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          message_template: string
          name: string
          organization_id?: string | null
          trigger_type: string
        }
        Update: {
          agent_id?: string
          channel?: string
          created_at?: string
          custom_date?: string | null
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          message_template?: string
          name?: string
          organization_id?: string | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "nova_automations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nova_automations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nova_conversations: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          organization_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          organization_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nova_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nova_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nova_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "nova_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "nova_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      nova_partner_commissions: {
        Row: {
          billing_period_end: string
          billing_period_start: string
          commission_amount: number
          commission_rate: number
          created_at: string | null
          id: string
          nova_subscriber_count: number
          organization_id: string | null
          status: string | null
          stripe_credit_id: string | null
        }
        Insert: {
          billing_period_end: string
          billing_period_start: string
          commission_amount: number
          commission_rate: number
          created_at?: string | null
          id?: string
          nova_subscriber_count: number
          organization_id?: string | null
          status?: string | null
          stripe_credit_id?: string | null
        }
        Update: {
          billing_period_end?: string
          billing_period_start?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string | null
          id?: string
          nova_subscriber_count?: number
          organization_id?: string | null
          status?: string | null
          stripe_credit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nova_partner_commissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_carrier_methods: {
        Row: {
          applies_to: string[]
          created_at: string
          id: string
          instructions: string | null
          is_default: boolean
          method: string
          org_carrier_id: string
          organization_id: string
          sort_order: number
          target_email: string | null
          target_url: string | null
          updated_at: string
        }
        Insert: {
          applies_to?: string[]
          created_at?: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          method: string
          org_carrier_id: string
          organization_id: string
          sort_order?: number
          target_email?: string | null
          target_url?: string | null
          updated_at?: string
        }
        Update: {
          applies_to?: string[]
          created_at?: string
          id?: string
          instructions?: string | null
          is_default?: boolean
          method?: string
          org_carrier_id?: string
          organization_id?: string
          sort_order?: number
          target_email?: string | null
          target_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_carrier_methods_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_carrier_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_carriers: {
        Row: {
          carrier_id: string
          contracting_email: string | null
          contracting_phone: string | null
          contracting_portal_url: string | null
          created_at: string
          created_by: string | null
          custom_statuses: Json
          external_provider: string | null
          external_record_id: string | null
          external_status: string | null
          id: string
          integration_metadata: Json
          internal_instructions: string | null
          invitation_link: string | null
          just_in_time_appointments: boolean
          last_synced_at: string | null
          manual_override: boolean
          max_issue_age: number | null
          min_issue_age: number | null
          min_production_requirements: string | null
          organization_id: string
          product_types: string[]
          release_required: boolean
          release_requirements: string | null
          staff_notes: string | null
          status: string
          support_email: string | null
          support_phone: string | null
          surelc_url: string | null
          sync_error: string | null
          sync_source: string | null
          transfers_allowed: boolean
          turnaround_days: number | null
          updated_at: string
          updated_by: string | null
          writing_number_scope: string
        }
        Insert: {
          carrier_id: string
          contracting_email?: string | null
          contracting_phone?: string | null
          contracting_portal_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_statuses?: Json
          external_provider?: string | null
          external_record_id?: string | null
          external_status?: string | null
          id?: string
          integration_metadata?: Json
          internal_instructions?: string | null
          invitation_link?: string | null
          just_in_time_appointments?: boolean
          last_synced_at?: string | null
          manual_override?: boolean
          max_issue_age?: number | null
          min_issue_age?: number | null
          min_production_requirements?: string | null
          organization_id: string
          product_types?: string[]
          release_required?: boolean
          release_requirements?: string | null
          staff_notes?: string | null
          status?: string
          support_email?: string | null
          support_phone?: string | null
          surelc_url?: string | null
          sync_error?: string | null
          sync_source?: string | null
          transfers_allowed?: boolean
          turnaround_days?: number | null
          updated_at?: string
          updated_by?: string | null
          writing_number_scope?: string
        }
        Update: {
          carrier_id?: string
          contracting_email?: string | null
          contracting_phone?: string | null
          contracting_portal_url?: string | null
          created_at?: string
          created_by?: string | null
          custom_statuses?: Json
          external_provider?: string | null
          external_record_id?: string | null
          external_status?: string | null
          id?: string
          integration_metadata?: Json
          internal_instructions?: string | null
          invitation_link?: string | null
          just_in_time_appointments?: boolean
          last_synced_at?: string | null
          manual_override?: boolean
          max_issue_age?: number | null
          min_issue_age?: number | null
          min_production_requirements?: string | null
          organization_id?: string
          product_types?: string[]
          release_required?: boolean
          release_requirements?: string | null
          staff_notes?: string | null
          status?: string
          support_email?: string | null
          support_phone?: string | null
          surelc_url?: string | null
          sync_error?: string | null
          sync_source?: string | null
          transfers_allowed?: boolean
          turnaround_days?: number | null
          updated_at?: string
          updated_by?: string | null
          writing_number_scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_carriers_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_carriers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_carriers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_carriers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_contracting_settings: {
        Row: {
          agents_may_request_contracts: boolean
          auto_assign_staff_id: string | null
          created_at: string
          default_request_priority: string
          license_expiry_warning_days: number
          notify_on_missing_documents: boolean
          notify_on_status_change: boolean
          organization_id: string
          pdb_refresh_days: number
          request_sla_days: number
          require_manager_review: boolean
          require_owner_approval: boolean
          require_owner_approval_for_comp_change: boolean
          require_owner_approval_for_hierarchy: boolean
          updated_at: string
          updated_by: string | null
          warn_on_duplicate_requests: boolean
        }
        Insert: {
          agents_may_request_contracts?: boolean
          auto_assign_staff_id?: string | null
          created_at?: string
          default_request_priority?: string
          license_expiry_warning_days?: number
          notify_on_missing_documents?: boolean
          notify_on_status_change?: boolean
          organization_id: string
          pdb_refresh_days?: number
          request_sla_days?: number
          require_manager_review?: boolean
          require_owner_approval?: boolean
          require_owner_approval_for_comp_change?: boolean
          require_owner_approval_for_hierarchy?: boolean
          updated_at?: string
          updated_by?: string | null
          warn_on_duplicate_requests?: boolean
        }
        Update: {
          agents_may_request_contracts?: boolean
          auto_assign_staff_id?: string | null
          created_at?: string
          default_request_priority?: string
          license_expiry_warning_days?: number
          notify_on_missing_documents?: boolean
          notify_on_status_change?: boolean
          organization_id?: string
          pdb_refresh_days?: number
          request_sla_days?: number
          require_manager_review?: boolean
          require_owner_approval?: boolean
          require_owner_approval_for_comp_change?: boolean
          require_owner_approval_for_hierarchy?: boolean
          updated_at?: string
          updated_by?: string | null
          warn_on_duplicate_requests?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "org_contracting_settings_auto_assign_staff_id_fkey"
            columns: ["auto_assign_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_contracting_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_contracting_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_role_comp_mappings: {
        Row: {
          comp_level_id: string
          created_at: string
          id: string
          internal_role: string
          org_carrier_id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          comp_level_id: string
          created_at?: string
          id?: string
          internal_role: string
          org_carrier_id: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          comp_level_id?: string
          created_at?: string
          id?: string
          internal_role?: string
          org_carrier_id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_role_comp_mappings_comp_level_id_fkey"
            columns: ["comp_level_id"]
            isOneToOne: false
            referencedRelation: "carrier_comp_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_role_comp_mappings_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_role_comp_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          organization_id: string
          profile_id: string
          role: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id: string
          profile_id: string
          role?: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          profile_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          created_at: string
          email_categories: Json
          emails_enabled: boolean
          notify_contract_request: boolean
          notify_new_agent: boolean
          notify_new_ticket: boolean
          organization_id: string
          primary_admin_email: string | null
          support_email: string | null
          updated_at: string
          updated_by: string | null
          welcome_message: string | null
        }
        Insert: {
          created_at?: string
          email_categories?: Json
          emails_enabled?: boolean
          notify_contract_request?: boolean
          notify_new_agent?: boolean
          notify_new_ticket?: boolean
          organization_id: string
          primary_admin_email?: string | null
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
          welcome_message?: string | null
        }
        Update: {
          created_at?: string
          email_categories?: Json
          emails_enabled?: boolean
          notify_contract_request?: boolean
          notify_new_agent?: boolean
          notify_new_ticket?: boolean
          organization_id?: string
          primary_admin_email?: string | null
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_setup_state: {
        Row: {
          checklist_dismissed: boolean
          completed_at: string | null
          dismissed_steps: string[]
          organization_id: string
          updated_at: string
        }
        Insert: {
          checklist_dismissed?: boolean
          completed_at?: string | null
          dismissed_steps?: string[]
          organization_id: string
          updated_at?: string
        }
        Update: {
          checklist_dismissed?: boolean
          completed_at?: string | null
          dismissed_steps?: string[]
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_setup_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_color: string | null
          active: boolean | null
          active_seat_count: number | null
          created_at: string | null
          custom_domain: string | null
          id: string
          logo_url: string | null
          name: string
          nova_partner_commission_rate: number | null
          nova_partner_commission_ytd: number | null
          nova_seats_purchased: number | null
          owner_id: string | null
          parent_org_id: string | null
          plan_type: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
          tagline: string | null
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          active?: boolean | null
          active_seat_count?: number | null
          created_at?: string | null
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          name: string
          nova_partner_commission_rate?: number | null
          nova_partner_commission_ytd?: number | null
          nova_seats_purchased?: number | null
          owner_id?: string | null
          parent_org_id?: string | null
          plan_type?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          tagline?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          active?: boolean | null
          active_seat_count?: number | null
          created_at?: string | null
          custom_domain?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          nova_partner_commission_rate?: number | null
          nova_partner_commission_ytd?: number | null
          nova_seats_purchased?: number | null
          owner_id?: string | null
          parent_org_id?: string | null
          plan_type?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          tagline?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pdb_reviews: {
        Row: {
          agent_id: string
          appointments_recorded: number
          created_at: string
          id: string
          licenses_recorded: number
          next_review_date: string | null
          organization_id: string
          pdb_upload_id: string
          regulatory_actions_found: number
          rejection_reason: string | null
          report_date: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          appointments_recorded?: number
          created_at?: string
          id?: string
          licenses_recorded?: number
          next_review_date?: string | null
          organization_id: string
          pdb_upload_id: string
          regulatory_actions_found?: number
          rejection_reason?: string | null
          report_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          appointments_recorded?: number
          created_at?: string
          id?: string
          licenses_recorded?: number
          next_review_date?: string | null
          organization_id?: string
          pdb_upload_id?: string
          regulatory_actions_found?: number
          rejection_reason?: string | null
          report_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdb_reviews_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdb_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdb_reviews_pdb_upload_id_fkey"
            columns: ["pdb_upload_id"]
            isOneToOne: false
            referencedRelation: "pdb_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdb_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pdb_uploads: {
        Row: {
          agent_id: string
          file_size_bytes: number | null
          filename: string | null
          id: string
          organization_id: string | null
          parsed_states: string[] | null
          report_date: string | null
          storage_path: string
          superseded_by: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          agent_id: string
          file_size_bytes?: number | null
          filename?: string | null
          id?: string
          organization_id?: string | null
          parsed_states?: string[] | null
          report_date?: string | null
          storage_path: string
          superseded_by?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          agent_id?: string
          file_size_bytes?: number | null
          filename?: string | null
          id?: string
          organization_id?: string | null
          parsed_states?: string[] | null
          report_date?: string | null
          storage_path?: string
          superseded_by?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdb_uploads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdb_uploads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdb_uploads_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "pdb_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdb_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_agents: {
        Row: {
          contracts_label: string | null
          created_at: string
          created_by: string | null
          depth: string | null
          email: string
          first_name: string | null
          id: string
          joined_date: string | null
          last_active_label: string | null
          last_name: string | null
          location: string | null
          source: string | null
          status_label: string | null
          upline_id: string | null
        }
        Insert: {
          contracts_label?: string | null
          created_at?: string
          created_by?: string | null
          depth?: string | null
          email: string
          first_name?: string | null
          id?: string
          joined_date?: string | null
          last_active_label?: string | null
          last_name?: string | null
          location?: string | null
          source?: string | null
          status_label?: string | null
          upline_id?: string | null
        }
        Update: {
          contracts_label?: string | null
          created_at?: string
          created_by?: string | null
          depth?: string | null
          email?: string
          first_name?: string | null
          id?: string
          joined_date?: string | null
          last_active_label?: string | null
          last_name?: string | null
          location?: string | null
          source?: string | null
          status_label?: string | null
          upline_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_agents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_agents_upline_id_fkey"
            columns: ["upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          description: string | null
          included_seats: number
          key: string
          monthly_price: number
          name: string
          seat_overage_price: number
          setup_price: number
          sort_order: number
          stripe_price_env: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          description?: string | null
          included_seats?: number
          key: string
          monthly_price?: number
          name: string
          seat_overage_price?: number
          setup_price?: number
          sort_order?: number
          stripe_price_env?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          description?: string | null
          included_seats?: number
          key?: string
          monthly_price?: number
          name?: string
          seat_overage_price?: number
          setup_price?: number
          sort_order?: number
          stripe_price_env?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          agent_id: string
          annual_premium: number | null
          assigned_to_email: string | null
          carrier_id: string | null
          carrier_integration: string | null
          client_id: string
          effective_date: string | null
          face_amount: number | null
          id: string
          is_gtl: boolean
          last_synced_at: string | null
          monthly_premium: number | null
          organization_id: string | null
          policy_number: string | null
          posted_at: string
          product: string | null
          status: Database["public"]["Enums"]["policy_status"]
          sync_source: string | null
        }
        Insert: {
          agent_id: string
          annual_premium?: number | null
          assigned_to_email?: string | null
          carrier_id?: string | null
          carrier_integration?: string | null
          client_id: string
          effective_date?: string | null
          face_amount?: number | null
          id?: string
          is_gtl?: boolean
          last_synced_at?: string | null
          monthly_premium?: number | null
          organization_id?: string | null
          policy_number?: string | null
          posted_at?: string
          product?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
          sync_source?: string | null
        }
        Update: {
          agent_id?: string
          annual_premium?: number | null
          assigned_to_email?: string | null
          carrier_id?: string | null
          carrier_integration?: string | null
          client_id?: string
          effective_date?: string | null
          face_amount?: number | null
          id?: string
          is_gtl?: boolean
          last_synced_at?: string | null
          monthly_premium?: number | null
          organization_id?: string | null
          policy_number?: string | null
          posted_at?: string
          product?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
          sync_source?: string | null
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
          {
            foreignKeyName: "policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      producer_appointments: {
        Row: {
          agent_id: string
          carrier_id: string | null
          carrier_name: string | null
          created_at: string
          effective_date: string | null
          external_provider: string | null
          external_record_id: string | null
          id: string
          last_synced_at: string | null
          last_verified_at: string | null
          line_of_authority: string | null
          notes: string | null
          organization_id: string
          source_document_id: string | null
          state_code: string
          status: string
          termination_date: string | null
          termination_reason: string | null
          updated_at: string
          verification_source: string
          verified_by: string | null
        }
        Insert: {
          agent_id: string
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          effective_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          id?: string
          last_synced_at?: string | null
          last_verified_at?: string | null
          line_of_authority?: string | null
          notes?: string | null
          organization_id: string
          source_document_id?: string | null
          state_code: string
          status?: string
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          verification_source?: string
          verified_by?: string | null
        }
        Update: {
          agent_id?: string
          carrier_id?: string | null
          carrier_name?: string | null
          created_at?: string
          effective_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          id?: string
          last_synced_at?: string | null
          last_verified_at?: string | null
          line_of_authority?: string | null
          notes?: string | null
          organization_id?: string
          source_document_id?: string | null
          state_code?: string
          status?: string
          termination_date?: string | null
          termination_reason?: string | null
          updated_at?: string
          verification_source?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producer_appointments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_appointments_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_appointments_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          is_sensitive: boolean
          organization_id: string | null
          policy_number: string | null
          provider_name: string | null
          rejection_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string | null
          storage_path: string | null
          superseded_by: string | null
          updated_at: string
          uploaded_by: string | null
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
          is_sensitive?: boolean
          organization_id?: string | null
          policy_number?: string | null
          provider_name?: string | null
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          storage_path?: string | null
          superseded_by?: string | null
          updated_at?: string
          uploaded_by?: string | null
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
          is_sensitive?: boolean
          organization_id?: string | null
          policy_number?: string | null
          provider_name?: string | null
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string | null
          storage_path?: string | null
          superseded_by?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producer_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "producer_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_profiles: {
        Row: {
          address_history: Json
          completeness_checked_at: string | null
          contracting_notes: string | null
          created_at: string
          employment_history: Json
          legal_first_name: string | null
          legal_last_name: string | null
          legal_middle_name: string | null
          organization_id: string | null
          preferred_name: string | null
          profile_completeness: number
          profile_id: string
          resident_license_number: string | null
          resident_state: string | null
          suffix: string | null
          updated_at: string
        }
        Insert: {
          address_history?: Json
          completeness_checked_at?: string | null
          contracting_notes?: string | null
          created_at?: string
          employment_history?: Json
          legal_first_name?: string | null
          legal_last_name?: string | null
          legal_middle_name?: string | null
          organization_id?: string | null
          preferred_name?: string | null
          profile_completeness?: number
          profile_id: string
          resident_license_number?: string | null
          resident_state?: string | null
          suffix?: string | null
          updated_at?: string
        }
        Update: {
          address_history?: Json
          completeness_checked_at?: string | null
          contracting_notes?: string | null
          created_at?: string
          employment_history?: Json
          legal_first_name?: string | null
          legal_last_name?: string | null
          legal_middle_name?: string | null
          organization_id?: string | null
          preferred_name?: string | null
          profile_completeness?: number
          profile_id?: string
          resident_license_number?: string | null
          resident_state?: string | null
          suffix?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_regulatory_actions: {
        Row: {
          action_date: string | null
          action_type: string | null
          agent_id: string
          created_at: string
          disposition: string | null
          id: string
          organization_id: string
          recorded_by: string | null
          resolved: boolean
          source_document_id: string | null
          state_code: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          action_date?: string | null
          action_type?: string | null
          agent_id: string
          created_at?: string
          disposition?: string | null
          id?: string
          organization_id: string
          recorded_by?: string | null
          resolved?: boolean
          source_document_id?: string | null
          state_code?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          action_date?: string | null
          action_type?: string | null
          agent_id?: string
          created_at?: string
          disposition?: string | null
          id?: string
          organization_id?: string
          recorded_by?: string | null
          resolved?: boolean
          source_document_id?: string | null
          state_code?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_regulatory_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_regulatory_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producer_regulatory_actions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agent_slug: string | null
          agreement_agency_name: string | null
          agreement_signature_html: string | null
          agreement_signed_at: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          drivers_license_expiry: string | null
          drivers_license_number: string | null
          drivers_license_state: string | null
          email: string | null
          first_name: string | null
          first_sale_at: string | null
          gender: string | null
          google_oauth_connected: boolean
          id: string
          invite_signature_html: string | null
          is_hidden: boolean
          last_active_at: string | null
          last_name: string | null
          marital_status: string | null
          monthly_alp_goal: number | null
          needs_transfer_request: boolean | null
          nova_pro_activated_at: string | null
          nova_pro_expires_at: string | null
          nova_pro_phone_number: string | null
          nova_pro_source: string | null
          nova_pro_status: string | null
          nova_usage_ai_queries: number | null
          nova_usage_automations: number | null
          nova_usage_calls_minutes: number | null
          nova_usage_reset_at: string | null
          nova_usage_sms: number | null
          npn_number: string | null
          onboarding_completed_at: string | null
          organization_id: string | null
          phone: string | null
          ssn_encrypted: string | null
          ssn_last4: string | null
          staff_for_user_id: string | null
          state: string | null
          status: string
          street_address: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          surelc_agent_id: string | null
          terminated_at: string | null
          transfer_workflow_carriers: Json | null
          upline_id: string | null
          zip_code: string | null
        }
        Insert: {
          agent_slug?: string | null
          agreement_agency_name?: string | null
          agreement_signature_html?: string | null
          agreement_signed_at?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          drivers_license_state?: string | null
          email?: string | null
          first_name?: string | null
          first_sale_at?: string | null
          gender?: string | null
          google_oauth_connected?: boolean
          id: string
          invite_signature_html?: string | null
          is_hidden?: boolean
          last_active_at?: string | null
          last_name?: string | null
          marital_status?: string | null
          monthly_alp_goal?: number | null
          needs_transfer_request?: boolean | null
          nova_pro_activated_at?: string | null
          nova_pro_expires_at?: string | null
          nova_pro_phone_number?: string | null
          nova_pro_source?: string | null
          nova_pro_status?: string | null
          nova_usage_ai_queries?: number | null
          nova_usage_automations?: number | null
          nova_usage_calls_minutes?: number | null
          nova_usage_reset_at?: string | null
          nova_usage_sms?: number | null
          npn_number?: string | null
          onboarding_completed_at?: string | null
          organization_id?: string | null
          phone?: string | null
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          staff_for_user_id?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          surelc_agent_id?: string | null
          terminated_at?: string | null
          transfer_workflow_carriers?: Json | null
          upline_id?: string | null
          zip_code?: string | null
        }
        Update: {
          agent_slug?: string | null
          agreement_agency_name?: string | null
          agreement_signature_html?: string | null
          agreement_signed_at?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          drivers_license_state?: string | null
          email?: string | null
          first_name?: string | null
          first_sale_at?: string | null
          gender?: string | null
          google_oauth_connected?: boolean
          id?: string
          invite_signature_html?: string | null
          is_hidden?: boolean
          last_active_at?: string | null
          last_name?: string | null
          marital_status?: string | null
          monthly_alp_goal?: number | null
          needs_transfer_request?: boolean | null
          nova_pro_activated_at?: string | null
          nova_pro_expires_at?: string | null
          nova_pro_phone_number?: string | null
          nova_pro_source?: string | null
          nova_pro_status?: string | null
          nova_usage_ai_queries?: number | null
          nova_usage_automations?: number | null
          nova_usage_calls_minutes?: number | null
          nova_usage_reset_at?: string | null
          nova_usage_sms?: number | null
          npn_number?: string | null
          onboarding_completed_at?: string | null
          organization_id?: string | null
          phone?: string | null
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          staff_for_user_id?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          surelc_agent_id?: string | null
          terminated_at?: string | null
          transfer_workflow_carriers?: Json | null
          upline_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_upline_id_fkey"
            columns: ["upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      ready_to_sell_records: {
        Row: {
          agent_id: string
          appointed_states: string[]
          blockers: Json
          computed_at: string
          created_at: string
          id: string
          licensed_states: string[]
          org_carrier_id: string
          organization_id: string
          product_lines: string[]
          request_id: string | null
          sellable_states: string[]
          status: string
        }
        Insert: {
          agent_id: string
          appointed_states?: string[]
          blockers?: Json
          computed_at?: string
          created_at?: string
          id?: string
          licensed_states?: string[]
          org_carrier_id: string
          organization_id: string
          product_lines?: string[]
          request_id?: string | null
          sellable_states?: string[]
          status?: string
        }
        Update: {
          agent_id?: string
          appointed_states?: string[]
          blockers?: Json
          computed_at?: string
          created_at?: string
          id?: string
          licensed_states?: string[]
          org_carrier_id?: string
          organization_id?: string
          product_lines?: string[]
          request_id?: string | null
          sellable_states?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ready_to_sell_records_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ready_to_sell_records_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ready_to_sell_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ready_to_sell_records_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "contracting_requests"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "recruiting_funnels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          phone: string | null
          recruiter_id: string
          source: string | null
          stage: Database["public"]["Enums"]["recruiting_stage"]
          tracker_type: string
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
          organization_id?: string | null
          phone?: string | null
          recruiter_id: string
          source?: string | null
          stage?: Database["public"]["Enums"]["recruiting_stage"]
          tracker_type?: string
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
          organization_id?: string | null
          phone?: string | null
          recruiter_id?: string
          source?: string | null
          stage?: Database["public"]["Enums"]["recruiting_stage"]
          tracker_type?: string
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
            foreignKeyName: "recruiting_prospects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      retention_cases: {
        Row: {
          agent_id: string
          assigned_to: string | null
          contacted_at: string | null
          id: string
          opened_at: string
          organization_id: string | null
          outcome_note: string | null
          policy_id: string
          premium_at_risk: number | null
          resolved_at: string | null
          risk_reason: string
          risk_score: number
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          assigned_to?: string | null
          contacted_at?: string | null
          id?: string
          opened_at?: string
          organization_id?: string | null
          outcome_note?: string | null
          policy_id: string
          premium_at_risk?: number | null
          resolved_at?: string | null
          risk_reason?: string
          risk_score?: number
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          assigned_to?: string | null
          contacted_at?: string | null
          id?: string
          opened_at?: string
          organization_id?: string | null
          outcome_note?: string | null
          policy_id?: string
          premium_at_risk?: number | null
          resolved_at?: string | null
          risk_reason?: string
          risk_score?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_cases_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_cases_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
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
      role_permissions: {
        Row: {
          admin_invite_users: boolean | null
          admin_manage_staff_configs: boolean | null
          admin_view_agency_tickets: boolean | null
          admin_view_billing_readonly: boolean | null
          contracting_approve: boolean | null
          contracting_assign_staff: boolean | null
          contracting_export: boolean | null
          contracting_manage_carriers: boolean | null
          contracting_manage_comp_levels: boolean | null
          contracting_manage_hierarchy: boolean | null
          contracting_manage_licenses: boolean | null
          contracting_submit: boolean | null
          contracting_view_agency_comp: boolean | null
          contracting_view_audit: boolean | null
          contracting_view_banking: boolean | null
          contracting_view_sensitive_docs: boolean | null
          contracting_view_tax_docs: boolean | null
          created_at: string | null
          id: string
          mgr_access_recruiting: boolean | null
          mgr_edit_agent_profiles: boolean | null
          mgr_edit_client_records: boolean | null
          mgr_manage_onboarding: boolean | null
          mgr_manage_resources: boolean | null
          mgr_post_deals_for_agents: boolean | null
          mgr_respond_tickets: boolean | null
          mgr_submit_carrier_requests: boolean | null
          mgr_view_agent_commissions: boolean | null
          mgr_view_all_agents: boolean | null
          mgr_view_client_records: boolean | null
          mgr_view_team_analytics: boolean | null
          organization_id: string | null
          profile_id: string | null
          staff_delete_clients: boolean | null
          staff_edit_clients: boolean | null
          staff_edit_contracts: boolean | null
          staff_edit_policies: boolean | null
          staff_edit_recruiting: boolean | null
          staff_is_admin: boolean | null
          staff_manage_resources: boolean | null
          staff_move_recruiting_stages: boolean | null
          staff_nova_pro_enabled: boolean | null
          staff_post_policies: boolean | null
          staff_preset: string | null
          staff_respond_tickets: boolean | null
          staff_submit_carrier_requests: boolean | null
          staff_view_all_tickets: boolean | null
          staff_view_analytics: boolean | null
          staff_view_clients: boolean | null
          staff_view_commissions: boolean | null
          staff_view_contracts: boolean | null
          staff_view_policies: boolean | null
          staff_view_recruiting: boolean | null
          updated_at: string | null
        }
        Insert: {
          admin_invite_users?: boolean | null
          admin_manage_staff_configs?: boolean | null
          admin_view_agency_tickets?: boolean | null
          admin_view_billing_readonly?: boolean | null
          contracting_approve?: boolean | null
          contracting_assign_staff?: boolean | null
          contracting_export?: boolean | null
          contracting_manage_carriers?: boolean | null
          contracting_manage_comp_levels?: boolean | null
          contracting_manage_hierarchy?: boolean | null
          contracting_manage_licenses?: boolean | null
          contracting_submit?: boolean | null
          contracting_view_agency_comp?: boolean | null
          contracting_view_audit?: boolean | null
          contracting_view_banking?: boolean | null
          contracting_view_sensitive_docs?: boolean | null
          contracting_view_tax_docs?: boolean | null
          created_at?: string | null
          id?: string
          mgr_access_recruiting?: boolean | null
          mgr_edit_agent_profiles?: boolean | null
          mgr_edit_client_records?: boolean | null
          mgr_manage_onboarding?: boolean | null
          mgr_manage_resources?: boolean | null
          mgr_post_deals_for_agents?: boolean | null
          mgr_respond_tickets?: boolean | null
          mgr_submit_carrier_requests?: boolean | null
          mgr_view_agent_commissions?: boolean | null
          mgr_view_all_agents?: boolean | null
          mgr_view_client_records?: boolean | null
          mgr_view_team_analytics?: boolean | null
          organization_id?: string | null
          profile_id?: string | null
          staff_delete_clients?: boolean | null
          staff_edit_clients?: boolean | null
          staff_edit_contracts?: boolean | null
          staff_edit_policies?: boolean | null
          staff_edit_recruiting?: boolean | null
          staff_is_admin?: boolean | null
          staff_manage_resources?: boolean | null
          staff_move_recruiting_stages?: boolean | null
          staff_nova_pro_enabled?: boolean | null
          staff_post_policies?: boolean | null
          staff_preset?: string | null
          staff_respond_tickets?: boolean | null
          staff_submit_carrier_requests?: boolean | null
          staff_view_all_tickets?: boolean | null
          staff_view_analytics?: boolean | null
          staff_view_clients?: boolean | null
          staff_view_commissions?: boolean | null
          staff_view_contracts?: boolean | null
          staff_view_policies?: boolean | null
          staff_view_recruiting?: boolean | null
          updated_at?: string | null
        }
        Update: {
          admin_invite_users?: boolean | null
          admin_manage_staff_configs?: boolean | null
          admin_view_agency_tickets?: boolean | null
          admin_view_billing_readonly?: boolean | null
          contracting_approve?: boolean | null
          contracting_assign_staff?: boolean | null
          contracting_export?: boolean | null
          contracting_manage_carriers?: boolean | null
          contracting_manage_comp_levels?: boolean | null
          contracting_manage_hierarchy?: boolean | null
          contracting_manage_licenses?: boolean | null
          contracting_submit?: boolean | null
          contracting_view_agency_comp?: boolean | null
          contracting_view_audit?: boolean | null
          contracting_view_banking?: boolean | null
          contracting_view_sensitive_docs?: boolean | null
          contracting_view_tax_docs?: boolean | null
          created_at?: string | null
          id?: string
          mgr_access_recruiting?: boolean | null
          mgr_edit_agent_profiles?: boolean | null
          mgr_edit_client_records?: boolean | null
          mgr_manage_onboarding?: boolean | null
          mgr_manage_resources?: boolean | null
          mgr_post_deals_for_agents?: boolean | null
          mgr_respond_tickets?: boolean | null
          mgr_submit_carrier_requests?: boolean | null
          mgr_view_agent_commissions?: boolean | null
          mgr_view_all_agents?: boolean | null
          mgr_view_client_records?: boolean | null
          mgr_view_team_analytics?: boolean | null
          organization_id?: string | null
          profile_id?: string | null
          staff_delete_clients?: boolean | null
          staff_edit_clients?: boolean | null
          staff_edit_contracts?: boolean | null
          staff_edit_policies?: boolean | null
          staff_edit_recruiting?: boolean | null
          staff_is_admin?: boolean | null
          staff_manage_resources?: boolean | null
          staff_move_recruiting_stages?: boolean | null
          staff_nova_pro_enabled?: boolean | null
          staff_post_policies?: boolean | null
          staff_preset?: string | null
          staff_respond_tickets?: boolean | null
          staff_submit_carrier_requests?: boolean | null
          staff_view_all_tickets?: boolean | null
          staff_view_analytics?: boolean | null
          staff_view_clients?: boolean | null
          staff_view_commissions?: boolean | null
          staff_view_contracts?: boolean | null
          staff_view_policies?: boolean | null
          staff_view_recruiting?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_requests: {
        Row: {
          admin_notes: string | null
          completed_at: string | null
          id: string
          requesting_agent_id: string
          source_password_encrypted: string | null
          source_username: string
          status: string
          submitted_at: string
        }
        Insert: {
          admin_notes?: string | null
          completed_at?: string | null
          id?: string
          requesting_agent_id: string
          source_password_encrypted?: string | null
          source_username: string
          status?: string
          submitted_at?: string
        }
        Update: {
          admin_notes?: string | null
          completed_at?: string | null
          id?: string
          requesting_agent_id?: string
          source_password_encrypted?: string | null
          source_username?: string
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_requests_requesting_agent_id_fkey"
            columns: ["requesting_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          accent_color: string | null
          category: Database["public"]["Enums"]["script_category"]
          content_html: string | null
          content_markdown: string | null
          created_at: string
          forked_from: string | null
          id: string
          long_description: string | null
          organization_id: string | null
          short_description: string | null
          sort_order: number | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accent_color?: string | null
          category: Database["public"]["Enums"]["script_category"]
          content_html?: string | null
          content_markdown?: string | null
          created_at?: string
          forked_from?: string | null
          id?: string
          long_description?: string | null
          organization_id?: string | null
          short_description?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accent_color?: string | null
          category?: Database["public"]["Enums"]["script_category"]
          content_html?: string | null
          content_markdown?: string | null
          created_at?: string
          forked_from?: string | null
          id?: string
          long_description?: string | null
          organization_id?: string | null
          short_description?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scripts_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_conversations: {
        Row: {
          agent_id: string
          client_id: string | null
          created_at: string
          id: string
          last_message_at: string
          organization_id: string | null
          phone_number: string
          unread_count: number
        }
        Insert: {
          agent_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          organization_id?: string | null
          phone_number: string
          unread_count?: number
        }
        Update: {
          agent_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "sms_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          outcome: string | null
        }
        Insert: {
          activity_type: string
          agent_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          outcome?: string | null
        }
        Update: {
          activity_type?: string
          agent_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sophai_activity_agent_id_fkey1"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sophai_activity_client_id_fkey1"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sophai_activity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sophai_settings: {
        Row: {
          agent_id: string
          anniversary_messages_enabled: boolean
          beneficiary_engagement_enabled: boolean | null
          birthday_messages_enabled: boolean | null
          email_notifications_enabled: boolean
          id: string
          lapse_followup_enabled: boolean
          organization_id: string | null
          policy_recovery_enabled: boolean | null
          sms_followup_enabled: boolean | null
          sms_notifications_enabled: boolean
        }
        Insert: {
          agent_id: string
          anniversary_messages_enabled?: boolean
          beneficiary_engagement_enabled?: boolean | null
          birthday_messages_enabled?: boolean | null
          email_notifications_enabled?: boolean
          id?: string
          lapse_followup_enabled?: boolean
          organization_id?: string | null
          policy_recovery_enabled?: boolean | null
          sms_followup_enabled?: boolean | null
          sms_notifications_enabled?: boolean
        }
        Update: {
          agent_id?: string
          anniversary_messages_enabled?: boolean
          beneficiary_engagement_enabled?: boolean | null
          birthday_messages_enabled?: boolean | null
          email_notifications_enabled?: boolean
          id?: string
          lapse_followup_enabled?: boolean
          organization_id?: string | null
          policy_recovery_enabled?: boolean | null
          sms_followup_enabled?: boolean | null
          sms_notifications_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sophai_settings_agent_id_fkey1"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sophai_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          external_provider: string | null
          external_record_id: string | null
          id: string
          is_resident: boolean | null
          issued_date: string | null
          last_synced_at: string | null
          last_verified_at: string | null
          license_number: string | null
          license_type: string | null
          loa: string | null
          loa_status: string | null
          manual_override: boolean
          next_review_date: string | null
          notes: string | null
          npn_number: string | null
          organization_id: string | null
          source_document_id: string | null
          state_code: string
          status: string
          sync_error: string | null
          updated_at: string | null
          verification_source: string
          verified_by: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          id?: string
          is_resident?: boolean | null
          issued_date?: string | null
          last_synced_at?: string | null
          last_verified_at?: string | null
          license_number?: string | null
          license_type?: string | null
          loa?: string | null
          loa_status?: string | null
          manual_override?: boolean
          next_review_date?: string | null
          notes?: string | null
          npn_number?: string | null
          organization_id?: string | null
          source_document_id?: string | null
          state_code: string
          status?: string
          sync_error?: string | null
          updated_at?: string | null
          verification_source?: string
          verified_by?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          id?: string
          is_resident?: boolean | null
          issued_date?: string | null
          last_synced_at?: string | null
          last_verified_at?: string | null
          license_number?: string | null
          license_type?: string | null
          loa?: string | null
          loa_status?: string | null
          manual_override?: boolean
          next_review_date?: string | null
          notes?: string | null
          npn_number?: string | null
          organization_id?: string | null
          source_document_id?: string | null
          state_code?: string
          status?: string
          sync_error?: string | null
          updated_at?: string | null
          verification_source?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "state_licenses_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_licenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_licenses_verified_by_fkey"
            columns: ["verified_by"]
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
          assigned_to: string | null
          category: string
          created_at: string | null
          description: string
          escalated_at: string | null
          escalated_by: string | null
          first_response_at: string | null
          id: string
          organization_id: string | null
          priority: string
          resolved_at: string | null
          scope: string
          status: string
          subject: string
          ticket_number: number
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          assigned_to?: string | null
          category: string
          created_at?: string | null
          description: string
          escalated_at?: string | null
          escalated_by?: string | null
          first_response_at?: string | null
          id?: string
          organization_id?: string | null
          priority?: string
          resolved_at?: string | null
          scope?: string
          status?: string
          subject: string
          ticket_number?: number
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          assigned_to?: string | null
          category?: string
          created_at?: string | null
          description?: string
          escalated_at?: string | null
          escalated_by?: string | null
          first_response_at?: string | null
          id?: string
          organization_id?: string | null
          priority?: string
          resolved_at?: string | null
          scope?: string
          status?: string
          subject?: string
          ticket_number?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_escalated_by_fkey"
            columns: ["escalated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      tasks: {
        Row: {
          assigned_to: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          organization_id: string | null
          priority: string
          related_id: string | null
          related_type: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string | null
          priority?: string
          related_id?: string | null
          related_type?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string | null
          priority?: string
          related_id?: string | null
          related_type?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_request_activity: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_status: string | null
          note: string | null
          performed_by: string | null
          previous_status: string | null
          transfer_request_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_status?: string | null
          note?: string | null
          performed_by?: string | null
          previous_status?: string | null
          transfer_request_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_status?: string | null
          note?: string | null
          performed_by?: string | null
          previous_status?: string | null
          transfer_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_request_activity_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_request_activity_transfer_request_id_fkey"
            columns: ["transfer_request_id"]
            isOneToOne: false
            referencedRelation: "transfer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_requests: {
        Row: {
          agent_id: string
          assigned_to: string | null
          carrier_id: string | null
          completed_at: string | null
          created_at: string
          current_level: string | null
          current_upline_email: string | null
          current_upline_name: string | null
          documents: Json | null
          from_agency_id: string | null
          from_upline_id: string | null
          id: string
          notes: string | null
          organization_id: string | null
          reason: string | null
          requested_at: string | null
          status: string
          submitted_by: string | null
          to_agency_id: string | null
          to_agency_name: string | null
          to_upline_id: string | null
          transfer_type: string | null
          updated_at: string | null
          writing_number: string | null
        }
        Insert: {
          agent_id: string
          assigned_to?: string | null
          carrier_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_level?: string | null
          current_upline_email?: string | null
          current_upline_name?: string | null
          documents?: Json | null
          from_agency_id?: string | null
          from_upline_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          reason?: string | null
          requested_at?: string | null
          status?: string
          submitted_by?: string | null
          to_agency_id?: string | null
          to_agency_name?: string | null
          to_upline_id?: string | null
          transfer_type?: string | null
          updated_at?: string | null
          writing_number?: string | null
        }
        Update: {
          agent_id?: string
          assigned_to?: string | null
          carrier_id?: string | null
          completed_at?: string | null
          created_at?: string
          current_level?: string | null
          current_upline_email?: string | null
          current_upline_name?: string | null
          documents?: Json | null
          from_agency_id?: string | null
          from_upline_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string | null
          reason?: string | null
          requested_at?: string | null
          status?: string
          submitted_by?: string | null
          to_agency_id?: string | null
          to_agency_name?: string | null
          to_upline_id?: string | null
          transfer_type?: string | null
          updated_at?: string | null
          writing_number?: string | null
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
            foreignKeyName: "transfer_requests_assigned_to_fkey"
            columns: ["assigned_to"]
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
            foreignKeyName: "transfer_requests_from_agency_id_fkey"
            columns: ["from_agency_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
            foreignKeyName: "transfer_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_requests_to_agency_id_fkey"
            columns: ["to_agency_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          type: Database["public"]["Enums"]["challenge_type"]
        }
        Insert: {
          agent_id: string
          challenge_id?: string | null
          earned_at?: string
          id?: string
          organization_id?: string | null
          type: Database["public"]["Enums"]["challenge_type"]
        }
        Update: {
          agent_id?: string
          challenge_id?: string | null
          earned_at?: string
          id?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "trophies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          action: string | null
          created_at: string
          duration_ms: number | null
          event: string
          id: number
          meta: Json
          organization_id: string | null
          path: string
          plan_type: string | null
          profile_id: string | null
          role: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          duration_ms?: number | null
          event: string
          id?: never
          meta?: Json
          organization_id?: string | null
          path: string
          plan_type?: string | null
          profile_id?: string | null
          role?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          duration_ms?: number | null
          event?: string
          id?: never
          meta?: Json
          organization_id?: string | null
          path?: string
          plan_type?: string | null
          profile_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_page_favorites: {
        Row: {
          created_at: string
          page_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          page_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          page_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_page_favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      waitlist_signups: {
        Row: {
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          notified_at: string | null
          persona: string | null
          phone: string | null
          source: string | null
          updated_at: string
          utm: Json | null
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          notified_at?: string | null
          persona?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
          utm?: Json | null
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notified_at?: string | null
          persona?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
          utm?: Json | null
        }
        Relationships: []
      }
      wallet: {
        Row: {
          agent_id: string
          balance_cents: number
          id: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          balance_cents?: number
          id?: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          balance_cents?: number
          id?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "wallet_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          stripe_payment_id: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
        }
        Insert: {
          agent_id: string
          amount_cents: number
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string | null
          stripe_payment_id?: string | null
          type: Database["public"]["Enums"]["wallet_txn_type"]
        }
        Update: {
          agent_id?: string
          amount_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "wallet_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_applications: {
        Row: {
          accent_color: string | null
          agent_count: string | null
          brand_name: string
          created_at: string
          desired_domain: string | null
          id: string
          logo_url: string | null
          notes: string | null
          organization_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string | null
          tagline: string | null
          timeline: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          agent_count?: string | null
          brand_name: string
          created_at?: string
          desired_domain?: string | null
          id?: string
          logo_url?: string | null
          notes?: string | null
          organization_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          tagline?: string | null
          timeline?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          agent_count?: string | null
          brand_name?: string
          created_at?: string
          desired_domain?: string | null
          id?: string
          logo_url?: string | null
          notes?: string | null
          organization_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string | null
          tagline?: string | null
          timeline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "white_label_applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "white_label_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "white_label_applications_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      writing_numbers: {
        Row: {
          advance_level: string | null
          agent_id: string
          comp_level_id: string | null
          confirmation_document_id: string | null
          created_at: string
          created_by: string | null
          direct_upline_id: string | null
          effective_date: string | null
          external_provider: string | null
          external_record_id: string | null
          hierarchy_path: string | null
          id: string
          last_synced_at: string | null
          manual_override: boolean
          notes: string | null
          number_type: string
          org_carrier_id: string
          organization_id: string
          product_line: string | null
          request_id: string | null
          scope: string
          source: string
          state_code: string | null
          status: string
          termination_date: string | null
          updated_at: string
          updated_by: string | null
          upline_npn: string | null
          upline_writing_number: string | null
          writing_number: string
        }
        Insert: {
          advance_level?: string | null
          agent_id: string
          comp_level_id?: string | null
          confirmation_document_id?: string | null
          created_at?: string
          created_by?: string | null
          direct_upline_id?: string | null
          effective_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          hierarchy_path?: string | null
          id?: string
          last_synced_at?: string | null
          manual_override?: boolean
          notes?: string | null
          number_type?: string
          org_carrier_id: string
          organization_id: string
          product_line?: string | null
          request_id?: string | null
          scope?: string
          source?: string
          state_code?: string | null
          status?: string
          termination_date?: string | null
          updated_at?: string
          updated_by?: string | null
          upline_npn?: string | null
          upline_writing_number?: string | null
          writing_number: string
        }
        Update: {
          advance_level?: string | null
          agent_id?: string
          comp_level_id?: string | null
          confirmation_document_id?: string | null
          created_at?: string
          created_by?: string | null
          direct_upline_id?: string | null
          effective_date?: string | null
          external_provider?: string | null
          external_record_id?: string | null
          hierarchy_path?: string | null
          id?: string
          last_synced_at?: string | null
          manual_override?: boolean
          notes?: string | null
          number_type?: string
          org_carrier_id?: string
          organization_id?: string
          product_line?: string | null
          request_id?: string | null
          scope?: string
          source?: string
          state_code?: string | null
          status?: string
          termination_date?: string | null
          updated_at?: string
          updated_by?: string | null
          upline_npn?: string | null
          upline_writing_number?: string | null
          writing_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "writing_numbers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_numbers_comp_level_id_fkey"
            columns: ["comp_level_id"]
            isOneToOne: false
            referencedRelation: "carrier_comp_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_numbers_confirmation_document_id_fkey"
            columns: ["confirmation_document_id"]
            isOneToOne: false
            referencedRelation: "producer_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_numbers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_numbers_direct_upline_id_fkey"
            columns: ["direct_upline_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_numbers_org_carrier_id_fkey"
            columns: ["org_carrier_id"]
            isOneToOne: false
            referencedRelation: "org_carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_numbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_numbers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "contracting_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writing_numbers_updated_by_fkey"
            columns: ["updated_by"]
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
      caller_is_active: { Args: never; Returns: boolean }
      can_approve_contracts: { Args: { _org: string }; Returns: boolean }
      can_assign_contracting_staff: { Args: { _org: string }; Returns: boolean }
      can_manage_comp_levels: { Args: { _org: string }; Returns: boolean }
      can_manage_contracting: { Args: { _org: string }; Returns: boolean }
      can_manage_hierarchy: { Args: { _org: string }; Returns: boolean }
      can_manage_licenses: { Args: { _org: string }; Returns: boolean }
      can_manage_resources: { Args: { _org: string }; Returns: boolean }
      can_see_agent_progress: { Args: { _agent: string }; Returns: boolean }
      can_submit_contracts: { Args: { _org: string }; Returns: boolean }
      can_view_agency_comp: { Args: { _org: string }; Returns: boolean }
      can_view_contracting: { Args: { _org: string }; Returns: boolean }
      can_view_contracting_audit: { Args: { _org: string }; Returns: boolean }
      can_view_sensitive_docs: { Args: { _org: string }; Returns: boolean }
      can_work_tickets: { Args: { _org: string }; Returns: boolean }
      check_rate_limit: {
        Args: { _key: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
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
      get_my_upline: { Args: never; Returns: string }
      get_policy_analytics: { Args: never; Returns: Json }
      get_quality_metrics: { Args: never; Returns: Json }
      get_recruiting_funnel: { Args: never; Returns: Json }
      get_scope_agents: {
        Args: { _scope: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
        }[]
      }
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
      get_team_downline_for: { Args: { p_root_id: string }; Returns: Json[] }
      get_team_kpis: { Args: never; Returns: Json }
      get_team_leaderboard: {
        Args: { _end: string; _start: string }
        Returns: Json
      }
      get_trends_12mo: { Args: never; Returns: Json }
      has_contracting_flag: {
        Args: { _flag: string; _org: string }
        Returns: boolean
      }
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
      is_org_admin: { Args: { _org: string }; Returns: boolean }
      is_org_owner: { Args: { _org: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_operator: { Args: never; Returns: boolean }
      list_applied_migrations: {
        Args: never
        Returns: {
          name: string
          version: string
        }[]
      }
      may_notify: {
        Args: { _category: string; _profile: string }
        Returns: boolean
      }
      may_write_academy_media: { Args: { _folder: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      my_org_ids: { Args: never; Returns: string[] }
      my_scopes: { Args: never; Returns: Json }
      normalize_policy_number: { Args: { _s: string }; Returns: string }
      prune_rate_limits: { Args: never; Returns: undefined }
      prune_usage_events: { Args: never; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_statement: {
        Args: { _statement_id: string }
        Returns: {
          matched: number
          unmatched: number
          variance_count: number
        }[]
      }
      same_org: { Args: { _profile: string }; Returns: boolean }
      scope_agent_ids: { Args: { _scope: string }; Returns: string[] }
      seed_agent_challenges: { Args: { _agent: string }; Returns: undefined }
      send_team_reminder: { Args: { _target: string }; Returns: Json }
      set_agent_status: {
        Args: { _agent: string; _status: string }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      ssn_reveal: { Args: never; Returns: string }
      ssn_set: { Args: { _ssn: string }; Returns: undefined }
      sync_retention_cases: { Args: { _org?: string }; Returns: number }
      waitlist_count: { Args: never; Returns: number }
    }
    Enums: {
      app_role:
        | "agent"
        | "staff"
        | "agency_owner"
        | "manager"
        | "super_admin"
        | "admin"
      challenge_type: "daily" | "weekly" | "monthly" | "quarterly"
      contract_status:
        | "assigned"
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
      app_role: [
        "agent",
        "staff",
        "agency_owner",
        "manager",
        "super_admin",
        "admin",
      ],
      challenge_type: ["daily", "weekly", "monthly", "quarterly"],
      contract_status: [
        "assigned",
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
