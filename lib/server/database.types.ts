import type { Choice } from "./contracts";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type CampaignMode = "active" | "protected" | "read_only";

export type AnalyticsEventName =
  | "section_impression"
  | "share_card_impression"
  | "share_cta_clicked"
  | "share_sheet_resolved"
  | "share_sheet_cancelled"
  | "share_link_copied"
  | "share_image_downloaded"
  | "referral_banner_impression"
  | "rapid_click_lock_shown"
  | "rapid_click_lock_confirmed"
  | "vote_rate_limited"
  | "vote_request_failed";

export type CommentAttemptOutcome =
  | "pending"
  | "invalid"
  | "rate_limited"
  | "vote_required"
  | "moderation_rejected"
  | "moderation_unavailable"
  | "accepted"
  | "database_error";

export type Database = {
  public: {
    Tables: {
      campaign_settings: {
        Row: {
          campaign_id: string;
          singleton: boolean;
          starts_at: string | null;
          ends_at: string | null;
          mode: CampaignMode;
          revision: number;
          updated_at: string;
        };
        Insert: {
          campaign_id?: string;
          singleton?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          mode?: CampaignMode;
          revision?: number;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string;
          singleton?: boolean;
          starts_at?: string | null;
          ends_at?: string | null;
          mode?: CampaignMode;
          revision?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaign_settings_history: {
        Row: {
          id: string;
          campaign_id: string;
          previous_starts_at: string | null;
          previous_ends_at: string | null;
          previous_mode: CampaignMode;
          new_starts_at: string | null;
          new_ends_at: string | null;
          new_mode: CampaignMode;
          previous_revision: number;
          new_revision: number;
          reason: string;
          changed_by: string;
          changed_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          previous_starts_at?: string | null;
          previous_ends_at?: string | null;
          previous_mode: CampaignMode;
          new_starts_at?: string | null;
          new_ends_at?: string | null;
          new_mode: CampaignMode;
          previous_revision: number;
          new_revision: number;
          reason: string;
          changed_by: string;
          changed_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          previous_starts_at?: string | null;
          previous_ends_at?: string | null;
          previous_mode?: CampaignMode;
          new_starts_at?: string | null;
          new_ends_at?: string | null;
          new_mode?: CampaignMode;
          previous_revision?: number;
          new_revision?: number;
          reason?: string;
          changed_by?: string;
          changed_at?: string;
        };
        Relationships: [];
      };
      analytics_visitors: {
        Row: {
          campaign_id: string;
          visitor_hash: string;
          first_seen_at: string;
          last_seen_at: string;
          first_referrer_host: string | null;
          first_utm_source: string | null;
          initial_referral_share_id: string | null;
          experiment_variant: string;
          analytics_enabled: boolean;
          first_analytics_seen_at: string | null;
        };
        Insert: {
          campaign_id: string;
          visitor_hash: string;
          first_seen_at?: string;
          last_seen_at?: string;
          first_referrer_host?: string | null;
          first_utm_source?: string | null;
          initial_referral_share_id?: string | null;
          experiment_variant: string;
          analytics_enabled?: boolean;
          first_analytics_seen_at?: string | null;
        };
        Update: {
          campaign_id?: string;
          visitor_hash?: string;
          first_seen_at?: string;
          last_seen_at?: string;
          first_referrer_host?: string | null;
          first_utm_source?: string | null;
          initial_referral_share_id?: string | null;
          experiment_variant?: string;
          analytics_enabled?: boolean;
          first_analytics_seen_at?: string | null;
        };
        Relationships: [];
      };
      analytics_sessions: {
        Row: {
          id: string;
          campaign_id: string;
          visitor_hash: string;
          network_hash: string;
          session_date: string;
          started_at: string;
          last_activity_at: string;
          expires_at: string;
          referrer_host: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          utm_term: string | null;
          country_code: string | null;
          browser_family: string | null;
          os_family: string | null;
          device_type: string | null;
          language: string | null;
          client_timezone: string | null;
          referral_share_id: string | null;
          self_referral: boolean;
          analytics_enabled: boolean;
          visible_ms: number;
          active_ms: number;
          last_accounted_at: string;
          last_active_accounted_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          visitor_hash: string;
          network_hash: string;
          session_date: string;
          started_at?: string;
          last_activity_at?: string;
          expires_at: string;
          referrer_host?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_term?: string | null;
          country_code?: string | null;
          browser_family?: string | null;
          os_family?: string | null;
          device_type?: string | null;
          language?: string | null;
          client_timezone?: string | null;
          referral_share_id?: string | null;
          self_referral?: boolean;
          analytics_enabled?: boolean;
          visible_ms?: number;
          active_ms?: number;
          last_accounted_at?: string;
          last_active_accounted_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          visitor_hash?: string;
          network_hash?: string;
          session_date?: string;
          started_at?: string;
          last_activity_at?: string;
          expires_at?: string;
          referrer_host?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          utm_term?: string | null;
          country_code?: string | null;
          browser_family?: string | null;
          os_family?: string | null;
          device_type?: string | null;
          language?: string | null;
          client_timezone?: string | null;
          referral_share_id?: string | null;
          self_referral?: boolean;
          analytics_enabled?: boolean;
          visible_ms?: number;
          active_ms?: number;
          last_accounted_at?: string;
          last_active_accounted_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      analytics_page_views: {
        Row: {
          id: string;
          campaign_id: string;
          session_id: string;
          visitor_hash: string;
          landing_path: string;
          started_at: string;
          ended_at: string | null;
          visible_ms: number;
          active_ms: number;
          client_visible_ms: number;
          client_active_ms: number;
          max_scroll_percent: number;
          heartbeat_sequence: number;
          last_heartbeat_at: string | null;
          viewport_width: number | null;
          viewport_height: number | null;
          screen_width: number | null;
          screen_height: number | null;
          touch_capable: boolean | null;
          reduced_motion: boolean | null;
          referral_share_id: string | null;
          self_referral: boolean;
          analytics_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          campaign_id: string;
          session_id: string;
          visitor_hash: string;
          landing_path: string;
          started_at?: string;
          ended_at?: string | null;
          visible_ms?: number;
          active_ms?: number;
          client_visible_ms?: number;
          client_active_ms?: number;
          max_scroll_percent?: number;
          heartbeat_sequence?: number;
          last_heartbeat_at?: string | null;
          viewport_width?: number | null;
          viewport_height?: number | null;
          screen_width?: number | null;
          screen_height?: number | null;
          touch_capable?: boolean | null;
          reduced_motion?: boolean | null;
          referral_share_id?: string | null;
          self_referral?: boolean;
          analytics_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          session_id?: string;
          visitor_hash?: string;
          landing_path?: string;
          started_at?: string;
          ended_at?: string | null;
          visible_ms?: number;
          active_ms?: number;
          client_visible_ms?: number;
          client_active_ms?: number;
          max_scroll_percent?: number;
          heartbeat_sequence?: number;
          last_heartbeat_at?: string | null;
          viewport_width?: number | null;
          viewport_height?: number | null;
          screen_width?: number | null;
          screen_height?: number | null;
          touch_capable?: boolean | null;
          reduced_motion?: boolean | null;
          referral_share_id?: string | null;
          self_referral?: boolean;
          analytics_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      analytics_events: {
        Row: {
          id: string;
          campaign_id: string;
          session_id: string;
          page_view_id: string | null;
          visitor_hash: string;
          event_name: AnalyticsEventName;
          occurred_at: string;
          received_at: string;
          properties: Json;
        };
        Insert: {
          id: string;
          campaign_id: string;
          session_id: string;
          page_view_id?: string | null;
          visitor_hash: string;
          event_name: AnalyticsEventName;
          occurred_at: string;
          received_at?: string;
          properties?: Json;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          session_id?: string;
          page_view_id?: string | null;
          visitor_hash?: string;
          event_name?: AnalyticsEventName;
          occurred_at?: string;
          received_at?: string;
          properties?: Json;
        };
        Relationships: [];
      };
      analytics_rate_buckets: {
        Row: {
          rate_kind: string;
          subject_key: string;
          window_started_at: string;
          request_count: number;
          updated_at: string;
        };
        Insert: {
          rate_kind: string;
          subject_key: string;
          window_started_at: string;
          request_count?: number;
          updated_at?: string;
        };
        Update: {
          rate_kind?: string;
          subject_key?: string;
          window_started_at?: string;
          request_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      share_links: {
        Row: {
          id: string;
          campaign_id: string;
          creator_visitor_hash: string;
          session_id: string;
          page_view_id: string;
          idempotency_key: string;
          token_hash: string;
          choice: Choice;
          dip_count: number;
          pour_count: number;
          parent_share_id: string | null;
          image_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          creator_visitor_hash: string;
          session_id: string;
          page_view_id: string;
          idempotency_key: string;
          token_hash: string;
          choice: Choice;
          dip_count: number;
          pour_count: number;
          parent_share_id?: string | null;
          image_path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          creator_visitor_hash?: string;
          session_id?: string;
          page_view_id?: string;
          idempotency_key?: string;
          token_hash?: string;
          choice?: Choice;
          dip_count?: number;
          pour_count?: number;
          parent_share_id?: string | null;
          image_path?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      vote_count_shards: {
        Row: {
          campaign_id: string;
          choice: Choice;
          shard_id: number;
          vote_count: number;
          updated_at: string;
        };
        Insert: {
          campaign_id: string;
          choice: Choice;
          shard_id: number;
          vote_count?: number;
          updated_at?: string;
        };
        Update: {
          campaign_id?: string;
          choice?: Choice;
          shard_id?: number;
          vote_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      votes: {
        Row: {
          id: string;
          campaign_id: string;
          session_id: string | null;
          page_view_id: string | null;
          request_id: string;
          visitor_hash: string;
          network_hash: string;
          choice: Choice;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          session_id?: string | null;
          page_view_id?: string | null;
          request_id: string;
          visitor_hash: string;
          network_hash: string;
          choice: Choice;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          session_id?: string | null;
          page_view_id?: string | null;
          request_id?: string;
          visitor_hash?: string;
          network_hash?: string;
          choice?: Choice;
          created_at?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          visitor_hash: string;
          choice: Choice;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          visitor_hash: string;
          choice: Choice;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          visitor_hash?: string;
          choice?: Choice;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      vote_rate_buckets: {
        Row: {
          network_hash: string;
          window_started_at: string;
          vote_count: number;
          updated_at: string;
        };
        Insert: {
          network_hash: string;
          window_started_at: string;
          vote_count?: number;
          updated_at?: string;
        };
        Update: {
          network_hash?: string;
          window_started_at?: string;
          vote_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      comment_attempts: {
        Row: {
          id: string;
          visitor_hash: string;
          network_hash: string;
          outcome: CommentAttemptOutcome;
          detail_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          visitor_hash: string;
          network_hash: string;
          outcome?: CommentAttemptOutcome;
          detail_code?: string | null;
          created_at?: string;
        };
        Update: {
          outcome?: CommentAttemptOutcome;
          detail_code?: string | null;
          network_hash?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      analytics_daily_funnel: {
        Row: {
          campaign_id: string | null;
          session_date: string | null;
          visitors: number | null;
          new_visitors: number | null;
          returning_visitors: number | null;
          sessions: number | null;
          page_views: number | null;
          same_day_reentering_visitors: number | null;
          activated_visitors: number | null;
          successful_votes: number | null;
          share_links_created: number | null;
        };
        Relationships: [];
      };
      analytics_acquisition: {
        Row: {
          campaign_id: string | null;
          session_date: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          referrer_host: string | null;
          visitors: number | null;
          activated_visitors: number | null;
          successful_votes: number | null;
          visitor_vote_conversion_rate: number | null;
        };
        Relationships: [];
      };
      analytics_engagement: {
        Row: {
          campaign_id: string | null;
          session_date: string | null;
          sessions: number | null;
          active_ms_p50: number | null;
          active_ms_p75: number | null;
          average_max_scroll_percent: number | null;
          engaged_sessions: number | null;
        };
        Relationships: [];
      };
      analytics_retention: {
        Row: {
          campaign_id: string | null;
          cohort_date: string | null;
          cohort_visitors: number | null;
          d1_returning_visitors: number | null;
          d2_returning_visitors: number | null;
        };
        Relationships: [];
      };
      analytics_referral_funnel: {
        Row: {
          campaign_id: string | null;
          share_date: string | null;
          share_card_impressions: number | null;
          share_cta_clicks: number | null;
          links_created: number | null;
          external_arrivals: number | null;
          external_referral_sessions: number | null;
          external_referral_visitors: number | null;
          fixed_attributed_visitors: number | null;
          attributed_successful_votes: number | null;
          referred_activated_visitors: number | null;
        };
        Relationships: [];
      };
      analytics_cta_experiment: {
        Row: {
          campaign_id: string | null;
          experiment_variant: string | null;
          visitors: number | null;
          activated_visitors: number | null;
          share_card_impressions: number | null;
          share_cta_clicks: number | null;
          links_created: number | null;
          sharing_visitors: number | null;
          external_arrivals: number | null;
          referred_visitors: number | null;
          attributed_successful_votes: number | null;
        };
        Relationships: [];
      };
      analytics_data_quality: {
        Row: {
          campaign_id: string | null;
          measured_date: string | null;
          vote_rows: number | null;
          votes_with_session: number | null;
          votes_with_page_view: number | null;
          unique_events: number | null;
          client_error_events: number | null;
          events_without_page_view: number | null;
          page_views: number | null;
          page_views_without_heartbeat: number | null;
          shard_vote_count: number | null;
          shard_count_matches: boolean | null;
          vote_session_link_rate: number | null;
          vote_page_view_link_rate: number | null;
          client_error_event_rate: number | null;
          page_view_heartbeat_missing_rate: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      bootstrap_daily_session: {
        Args: {
          p_visitor_hash: string;
          p_network_hash: string;
          p_page_view_id: string;
          p_landing_path: string;
          p_referrer_host?: string | null;
          p_utm_source?: string | null;
          p_utm_medium?: string | null;
          p_utm_campaign?: string | null;
          p_utm_content?: string | null;
          p_utm_term?: string | null;
          p_country_code?: string | null;
          p_browser_family?: string | null;
          p_os_family?: string | null;
          p_device_type?: string | null;
          p_language?: string | null;
          p_timezone?: string | null;
          p_viewport_width?: number | null;
          p_viewport_height?: number | null;
          p_screen_width?: number | null;
          p_screen_height?: number | null;
          p_touch?: boolean | null;
          p_reduced_motion?: boolean | null;
          p_referral_token_hash?: string | null;
        };
        Returns: Array<{
          session_id: string;
          page_view_id: string;
          expires_at: string;
          server_time: string;
          campaign_id: string;
          campaign_status: CampaignMode;
          starts_at: string | null;
          ends_at: string | null;
          revision: number;
          experiment_variant: string;
        }>;
      };
      cast_vote: {
        Args: {
          p_visitor_hash: string;
          p_network_hash: string;
          p_session_id: string;
          p_page_view_id: string;
          p_request_id: string;
          p_choice: Choice;
        };
        Returns: Array<{
          vote_id: string;
          accepted: boolean;
          duplicate: boolean;
          choice: Choice;
        }>;
      };
      claim_comment_attempt: {
        Args: { p_visitor_hash: string; p_network_hash: string };
        Returns: Array<{
          attempt_id: string;
          allowed: boolean;
          retry_after_seconds: number;
        }>;
      };
      cleanup_operational_data: {
        Args: { p_before?: string };
        Returns: number;
      };
      create_share_link: {
        Args: {
          p_visitor_hash: string;
          p_session_id: string;
          p_page_view_id: string;
          p_idempotency_key: string;
          p_token_hash: string;
          p_choice: Choice;
          p_parent_token_hash?: string | null;
        };
        Returns: Array<{
          share_id: string;
          campaign_id: string;
          created: boolean;
          image_path: string | null;
          dip_count: number;
          pour_count: number;
        }>;
      };
      get_campaign_status: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          campaign_id: string;
          campaign_status: CampaignMode;
          starts_at: string | null;
          ends_at: string | null;
          revision: number;
          is_within_window: boolean;
          server_time: string;
        }>;
      };
      get_public_vote_results: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          dip_count: number;
          pour_count: number;
          total_count: number;
          campaign_id: string;
          campaign_status: CampaignMode;
          starts_at: string | null;
          ends_at: string | null;
          revision: number;
        }>;
      };
      get_vote_results: {
        Args: { p_visitor_hash: string };
        Returns: Array<{
          dip_count: number;
          pour_count: number;
          total_count: number;
          user_choice: Choice | null;
        }>;
      };
      record_analytics_events: {
        Args: {
          p_visitor_hash: string;
          p_session_id: string;
          p_events: Json;
        };
        Returns: Array<{
          accepted_count: number;
          duplicate_count: number;
        }>;
      };
      record_analytics_heartbeat: {
        Args: {
          p_visitor_hash: string;
          p_session_id: string;
          p_page_view_id: string;
          p_sequence: number;
          p_visible_ms: number;
          p_active_ms: number;
          p_max_scroll_percent: number;
        };
        Returns: Array<{
          accepted: boolean;
          visible_ms: number;
          active_ms: number;
          max_scroll_percent: number;
        }>;
      };
      resolve_share_link: {
        Args: { p_token_hash: string };
        Returns: Array<{
          share_id: string;
          campaign_id: string;
          choice: Choice;
          dip_count: number;
          pour_count: number;
          image_path: string | null;
          created_at: string;
        }>;
      };
      set_campaign_window: {
        Args: {
          p_starts_at: string | null;
          p_ends_at: string | null;
          p_mode: CampaignMode;
          p_reason: string;
        };
        Returns: Array<{
          campaign_id: string;
          starts_at: string | null;
          ends_at: string | null;
          mode: CampaignMode;
          revision: number;
          updated_at: string;
        }>;
      };
    };
    Enums: {
      vote_choice: Choice;
      campaign_mode: CampaignMode;
      analytics_event_name: AnalyticsEventName;
      comment_attempt_outcome: CommentAttemptOutcome;
    };
    CompositeTypes: Record<string, never>;
  };
};
