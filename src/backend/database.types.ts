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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      benefit_redemptions: {
        Row: {
          benefit_id: string
          id: string
          redeemed_at: string
          savings_cents: number
          user_id: string
        }
        Insert: {
          benefit_id: string
          id?: string
          redeemed_at?: string
          savings_cents: number
          user_id: string
        }
        Update: {
          benefit_id?: string
          id?: string
          redeemed_at?: string
          savings_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefit_redemptions_benefit_id_fkey"
            columns: ["benefit_id"]
            isOneToOne: false
            referencedRelation: "student_benefits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefit_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          listing_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          listing_id?: string | null
          title?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          listing_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      event_details: {
        Row: {
          capacity: number | null
          ends_at: string | null
          listing_id: string
          starts_at: string
          venue_name: string | null
        }
        Insert: {
          capacity?: number | null
          ends_at?: string | null
          listing_id: string
          starts_at: string
          venue_name?: string | null
        }
        Update: {
          capacity?: number | null
          ends_at?: string | null
          listing_id?: string
          starts_at?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      housing_details: {
        Row: {
          available_from: string | null
          available_until: string | null
          bills_included: boolean
          deposit_cents: number | null
          furnished: boolean
          housing_type: string
          listing_id: string
          rent_cents: number
          room_size_sqm: number | null
        }
        Insert: {
          available_from?: string | null
          available_until?: string | null
          bills_included?: boolean
          deposit_cents?: number | null
          furnished?: boolean
          housing_type: string
          listing_id: string
          rent_cents: number
          room_size_sqm?: number | null
        }
        Update: {
          available_from?: string | null
          available_until?: string | null
          bills_included?: boolean
          deposit_cents?: number | null
          furnished?: boolean
          housing_type?: string
          listing_id?: string
          rent_cents?: number
          room_size_sqm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "housing_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          applicant_id: string
          cover_note: string
          created_at: string
          id: string
          job_listing_id: string
          status: Database["public"]["Enums"]["application_status"]
          withdrawn_at: string | null
        }
        Insert: {
          applicant_id: string
          cover_note?: string
          created_at?: string
          id?: string
          job_listing_id: string
          status?: Database["public"]["Enums"]["application_status"]
          withdrawn_at?: string | null
        }
        Update: {
          applicant_id?: string
          cover_note?: string
          created_at?: string
          id?: string
          job_listing_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_listing_id_fkey"
            columns: ["job_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      job_details: {
        Row: {
          application_url: string | null
          company_name: string
          compensation_text: string
          hours_per_week_max: number | null
          hours_per_week_min: number | null
          listing_id: string
          workplace_mode: Database["public"]["Enums"]["workplace_mode"] | null
        }
        Insert: {
          application_url?: string | null
          company_name: string
          compensation_text?: string
          hours_per_week_max?: number | null
          hours_per_week_min?: number | null
          listing_id: string
          workplace_mode?: Database["public"]["Enums"]["workplace_mode"] | null
        }
        Update: {
          application_url?: string | null
          company_name?: string
          compensation_text?: string
          hours_per_week_max?: number | null
          hours_per_week_min?: number | null
          listing_id?: string
          workplace_mode?: Database["public"]["Enums"]["workplace_mode"] | null
        }
        Relationships: [
          {
            foreignKeyName: "job_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_media: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          object_path: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          object_path: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          object_path?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_media_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          city: string
          created_at: string
          currency: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["listing_kind"]
          owner_id: string
          price_cents: number | null
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          city?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          kind: Database["public"]["Enums"]["listing_kind"]
          owner_id: string
          price_cents?: number | null
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["listing_kind"]
          owner_id?: string
          price_cents?: number | null
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_details: {
        Row: {
          item_condition: Database["public"]["Enums"]["marketplace_condition"]
          listing_id: string
          pickup_only: boolean
          quantity: number
        }
        Insert: {
          item_condition?: Database["public"]["Enums"]["marketplace_condition"]
          listing_id: string
          pickup_only?: boolean
          quantity?: number
        }
        Update: {
          item_condition?: Database["public"]["Enums"]["marketplace_condition"]
          listing_id?: string
          pickup_only?: boolean
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_kind: Database["public"]["Enums"]["account_kind"]
          avatar_path: string | null
          bio: string
          city: string
          created_at: string
          display_name: string
          id: string
          is_discoverable: boolean
          student_status: Database["public"]["Enums"]["student_verification_status"]
          updated_at: string
        }
        Insert: {
          account_kind?: Database["public"]["Enums"]["account_kind"]
          avatar_path?: string | null
          bio?: string
          city?: string
          created_at?: string
          display_name: string
          id: string
          is_discoverable?: boolean
          student_status?: Database["public"]["Enums"]["student_verification_status"]
          updated_at?: string
        }
        Update: {
          account_kind?: Database["public"]["Enums"]["account_kind"]
          avatar_path?: string | null
          bio?: string
          city?: string
          created_at?: string
          display_name?: string
          id?: string
          is_discoverable?: boolean
          student_status?: Database["public"]["Enums"]["student_verification_status"]
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string
          id: string
          listing_id: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reported_user_id: string | null
          reporter_id: string
        }
        Insert: {
          created_at?: string
          details?: string
          id?: string
          listing_id?: string | null
          reason: Database["public"]["Enums"]["report_reason"]
          reported_user_id?: string | null
          reporter_id: string
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          listing_id?: string | null
          reason?: Database["public"]["Enums"]["report_reason"]
          reported_user_id?: string | null
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_listings: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_benefits: {
        Row: {
          benefit_type: Database["public"]["Enums"]["benefit_type"]
          created_at: string
          currency: string
          description: string
          eligibility_text: string
          ends_at: string | null
          id: string
          listing_id: string | null
          original_price_cents: number | null
          sponsor_name: string
          sponsor_url: string | null
          starts_at: string | null
          student_price_cents: number | null
          terms_url: string | null
          title: string
          verified_at: string | null
        }
        Insert: {
          benefit_type: Database["public"]["Enums"]["benefit_type"]
          created_at?: string
          currency?: string
          description?: string
          eligibility_text?: string
          ends_at?: string | null
          id?: string
          listing_id?: string | null
          original_price_cents?: number | null
          sponsor_name: string
          sponsor_url?: string | null
          starts_at?: string | null
          student_price_cents?: number | null
          terms_url?: string | null
          title: string
          verified_at?: string | null
        }
        Update: {
          benefit_type?: Database["public"]["Enums"]["benefit_type"]
          created_at?: string
          currency?: string
          description?: string
          eligibility_text?: string
          ends_at?: string | null
          id?: string
          listing_id?: string | null
          original_price_cents?: number | null
          sponsor_name?: string
          sponsor_url?: string | null
          starts_at?: string | null
          student_price_cents?: number | null
          terms_url?: string | null
          title?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_benefits_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_details: {
        Row: {
          capacity: number
          destination: string
          ends_at: string | null
          estimated_cost_cents: number | null
          listing_id: string
          starts_at: string
        }
        Insert: {
          capacity: number
          destination: string
          ends_at?: string | null
          estimated_cost_cents?: number | null
          listing_id: string
          starts_at: string
        }
        Update: {
          capacity?: number
          destination?: string
          ends_at?: string | null
          estimated_cost_cents?: number | null
          listing_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_details_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_participants: {
        Row: {
          joined_at: string
          trip_listing_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          trip_listing_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          trip_listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_participants_trip_listing_id_fkey"
            columns: ["trip_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_participants_user_id_fkey"
            columns: ["user_id"]
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
      save_student_listing: {
        Args: {
          p_bills_included: boolean
          p_city: string
          p_condition: Database["public"]["Enums"]["marketplace_condition"]
          p_description: string
          p_furnished: boolean
          p_housing_type: string
          p_id: string
          p_kind: Database["public"]["Enums"]["listing_kind"]
          p_price_cents: number
          p_title: string
        }
        Returns: string
      }
      start_listing_conversation: {
        Args: { p_listing_id: string }
        Returns: string
      }
    }
    Enums: {
      account_kind: "student" | "employer" | "partner"
      application_status: "submitted" | "reviewing" | "accepted" | "rejected"
      benefit_type: "discount" | "subsidy" | "freebie" | "cashback"
      listing_kind: "housing" | "marketplace" | "trip" | "job" | "event"
      listing_status: "draft" | "active" | "reserved" | "closed"
      marketplace_condition: "new" | "like_new" | "good" | "fair"
      report_reason:
        | "spam"
        | "fraud"
        | "harassment"
        | "unsafe"
        | "prohibited"
        | "other"
      student_verification_status:
        | "unverified"
        | "pending"
        | "verified"
        | "rejected"
      workplace_mode: "onsite" | "hybrid" | "remote"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_kind: ["student", "employer", "partner"],
      application_status: ["submitted", "reviewing", "accepted", "rejected"],
      benefit_type: ["discount", "subsidy", "freebie", "cashback"],
      listing_kind: ["housing", "marketplace", "trip", "job", "event"],
      listing_status: ["draft", "active", "reserved", "closed"],
      marketplace_condition: ["new", "like_new", "good", "fair"],
      report_reason: [
        "spam",
        "fraud",
        "harassment",
        "unsafe",
        "prohibited",
        "other",
      ],
      student_verification_status: [
        "unverified",
        "pending",
        "verified",
        "rejected",
      ],
      workplace_mode: ["onsite", "hybrid", "remote"],
    },
  },
} as const
